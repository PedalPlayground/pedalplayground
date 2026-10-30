// Starts the "Catalog publish" GitHub Action, which builds newly approved items and rewrites catalog.json.
// The editor page calls this right after approve_catalog_submission(). Editors only.
//
// Secrets: GITHUB_DISPATCH_TOKEN (a fine-grained token for the repo with Contents: read and write, which is what
// repository_dispatch needs) and GITHUB_REPO ("PedalPlayground/pedalplayground"). See docs/catalog-backend.md.
import { admin, env, HttpError, requireUser } from "../_shared/supabase.ts";
import { handler } from "../_shared/http.ts";

Deno.serve(
  handler(async (req) => {
    const user = await requireUser(req);
    const { data: editor, error } = await admin.from("catalog_editors").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!editor) throw new HttpError(403, "Only catalog editors can publish.");

    const res = await fetch(`https://api.github.com/repos/${env("GITHUB_REPO")}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("GITHUB_DISPATCH_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "pedalplayground-catalog-publish",
      },
      body: JSON.stringify({ event_type: "catalog-publish", client_payload: { requested_by: user.id } }),
    });
    // GitHub answers 204 No Content when the run is queued.
    if (res.status !== 204) {
      console.error("repository_dispatch failed", res.status, await res.text());
      throw new HttpError(502, "Couldn't start the publish. Try again in a minute.");
    }
    return { started: true };
  }),
);
