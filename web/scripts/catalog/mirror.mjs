#!/usr/bin/env node
// Copies the published catalog from Supabase into a local folder, so the "Catalog publish" workflow can upload it to
// the web servers. Visitors load images from the servers, not from Supabase Storage: Storage needs database
// connections for every file it hasn't cached, and launch traffic ran it out of them (2026-10-30).
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/catalog/mirror.mjs --out DIR [--have FILE]
//
// --have lists files every server already has (one path per line, like "img/boss-ds1.0b7bdf0d.webp"). Those are
// skipped: names contain a content hash, so a file that exists is already correct. DIR gets the missing images and
// catalog.json. Exits non-zero if any image couldn't be fetched, so the workflow never uploads a manifest that
// points at files the servers don't have.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { withRetry } from "./retry.mjs";

const PUBLIC = "catalog-public";
const SAFE_PATH = /^(thumb|img)\/[\w.-]+\.webp$/;

/** Every image path the manifest refers to, sorted and without repeats. */
export function assetPaths(manifest) {
  const paths = new Set();
  for (const group of Object.values(manifest.assets ?? {})) {
    for (const a of Object.values(group)) {
      paths.add(a.thumb);
      paths.add(a.img);
    }
  }
  return [...paths].filter(Boolean).sort();
}

/** Fetches a public file through Supabase's CDN, which usually has it cached and then needs no database. Null if not. */
export function cdnFetcher(supabaseUrl, fetchImpl = fetch) {
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PUBLIC}/`;
  return async (p) => {
    try {
      const res = await fetchImpl(base + p);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  };
}

/**
 * db: a supabase-js client with the service role. Images come from the CDN when it has them (their names never get
 * reused, so a cached copy is always right), otherwise straight from Storage, a few at a time with patient retries,
 * because Storage needs a database connection for each and the database can be busy. catalog.json always comes
 * from Storage, since the CDN may hold an older one for a few minutes. Returns { manifest, downloaded, failures }.
 */
export async function mirrorCatalog(db, { out, have = new Set(), concurrency = 4, retry = { tries: 8 }, fromCdn = async () => null, log = console } = {}) {
  const bucket = db.storage.from(PUBLIC);
  const fromStorage = async (p) => {
    const { data, error } = await withRetry(() => bucket.download(p), retry);
    if (error) throw new Error(`download ${p}: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  };
  const get = async (p) => (await fromCdn(p)) ?? (await fromStorage(p));

  const manifestBody = await fromStorage("catalog.json");
  const manifest = JSON.parse(manifestBody.toString("utf8"));
  const all = assetPaths(manifest);
  const unsafe = all.filter((p) => !SAFE_PATH.test(p));
  if (unsafe.length) throw new Error(`catalog.json has unexpected image paths: ${unsafe.slice(0, 5).join(", ")}`);
  const missing = all.filter((p) => !have.has(p));
  log.log(`${all.length} images in the catalog, ${missing.length} to fetch`);

  const downloaded = [];
  const failures = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < missing.length) {
        const p = missing[next++];
        try {
          const body = await get(p);
          if (!body.length) throw new Error(`download ${p}: empty file`);
          const dest = path.join(out, p);
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, body);
          downloaded.push(p);
          if (downloaded.length % 500 === 0) log.log(`fetched ${downloaded.length}/${missing.length}`);
        } catch (e) {
          failures.push(p);
          log.error(e.message ?? String(e));
        }
      }
    }),
  );

  // Written last and only when every image arrived; the workflow uploads it after the images.
  if (!failures.length) await fs.writeFile(path.join(out, "catalog.json"), manifestBody);
  return { manifest, downloaded, failures };
}

// Command line: only when run directly, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const env = (name) => {
    const v = process.env[name];
    if (!v) {
      console.error(`Set ${name}.`);
      process.exit(2);
    }
    return v;
  };
  const out = arg("--out");
  if (!out) {
    console.error("Pass --out DIR.");
    process.exit(2);
  }
  const haveFile = arg("--have");
  const have = new Set(haveFile ? (await fs.readFile(haveFile, "utf8")).split("\n").map((l) => l.trim()).filter(Boolean) : []);
  await fs.mkdir(out, { recursive: true });
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { manifest, downloaded, failures } = await mirrorCatalog(db, { out, have, fromCdn: cdnFetcher(env("SUPABASE_URL")) });
  console.log(`catalog.json: ${manifest.pedals.length} pedals, ${manifest.pedalboards.length} pedalboards; fetched ${downloaded.length} images`);
  if (failures.length) {
    console.error(`${failures.length} image(s) couldn't be fetched, so catalog.json wasn't written. Run it again.`);
    process.exit(1);
  }
}
