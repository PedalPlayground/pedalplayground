#!/usr/bin/env node
// Publishes the Supabase catalog: builds images for items that need them, then rewrites catalog.json.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/catalog/publish.mjs [--dry-run] [--manifest-only]
//
// Runs in the "Catalog publish" GitHub Action (started by the catalog-publish Edge Function after an editor
// approves something, or by hand). Safe to run any time: it only builds items marked needs_render, and file names
// contain a hash of the source, so re-uploading is harmless. Old files are left in place for cached pages.
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { manifestFromRows } from "./manifest.mjs";
import { assetNames, CANVAS_MAX, renderAssets } from "./render.mjs";
import { withRetry } from "./retry.mjs";

const SOURCES = "catalog-sources";
const PUBLIC = "catalog-public";
const PAGE = 1000;

/** Reads every row matching a query, a page at a time (PostgREST caps a response at 1000 rows). */
async function allRows(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Runs async jobs with bounded parallelism; collects failures instead of stopping. */
async function pool(items, size, fn, log) {
  const failures = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          await fn(item);
        } catch (e) {
          failures.push(item);
          log.error(`failed ${item.kind} ${item.key}: ${e.message ?? e}`);
        }
      }
    }),
  );
  return failures;
}

/**
 * db: a supabase-js client with the service role. Returns what it did, for the CLI and tests.
 * Failed items keep needs_render, so the next run retries them; the manifest is still written for the rest.
 */
export async function publishCatalog(db, { dryRun = false, manifestOnly = false, log = console, concurrency = 4, retry = {} } = {}) {
  const upload = async (path, body, contentType, cacheControl) => {
    const { error } = await withRetry(() => db.storage.from(PUBLIC).upload(path, body, { contentType, cacheControl, upsert: true }), retry);
    if (error) throw new Error(`upload ${path}: ${error.message}`);
  };

  const built = [];
  const buildItem = async (item) => {
    const { data, error } = await withRetry(() => db.storage.from(SOURCES).download(item.source_path), retry);
    if (error) throw new Error(`download ${item.source_path}: ${error.message}`);
    const buf = Buffer.from(await data.arrayBuffer());
    const names = assetNames(buf, item.key);
    if (dryRun) return log.log(`would build ${item.kind} ${item.key} -> ${names.img}`);

    const out = await renderAssets(buf, CANVAS_MAX[item.kind]);
    // Images first, so a manifest never points at files that haven't arrived.
    await upload(names.thumb, out.thumb, "image/webp", "31536000");
    await upload(names.img, out.img, "image/webp", "31536000");

    // Only if the source is still the one we built: an approval that lands mid-build stays marked for the next run.
    const { error: updateError } = await db
      .from("catalog_items")
      .update({ source_hash: names.hash, thumb_path: names.thumb, img_path: names.img, needs_render: false })
      .eq("id", item.id)
      .eq("source_path", item.source_path);
    if (updateError) throw updateError;
    built.push(item.key);
    log.log(`built ${item.kind} ${item.key}`);
  };

  let failures = [];
  if (!manifestOnly) {
    const pending = await allRows(() =>
      db.from("catalog_items").select("id,kind,key,source_path").eq("needs_render", true).not("source_path", "is", null).order("id"),
    );
    log.log(`${pending.length} item(s) to build`);
    failures = await pool(pending, concurrency, buildItem, log);
  }

  let manifest = null;
  if (!dryRun) {
    const rows = await allRows(() =>
      db
        .from("catalog_items")
        .select("kind,key,brand,name,width_in,height_in,current_ma,voltage,type,status,added_on,thumb_path,img_path")
        .not("img_path", "is", null)
        .order("id"),
    );
    manifest = manifestFromRows(rows);
    await upload("catalog.json", JSON.stringify(manifest), "application/json", "300");
    log.log(`catalog.json: ${manifest.pedals.length} pedals, ${manifest.pedalboards.length} pedalboards`);
  }
  return { built, failures, manifest };
}

// Command line: only when run directly, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const env = (name) => {
    const v = process.env[name];
    if (!v) {
      console.error(`Set ${name}.`);
      process.exit(2);
    }
    return v;
  };
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { failures } = await publishCatalog(db, {
    dryRun: process.argv.includes("--dry-run"),
    manifestOnly: process.argv.includes("--manifest-only"),
    concurrency: Math.max(2, Math.min(8, os.cpus().length)),
  });
  if (failures.length) {
    console.error(`${failures.length} item(s) failed and stay marked for the next run.`);
    process.exit(1);
  }
}
