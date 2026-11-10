// Starts the "Catalog publish" GitHub Action, which builds newly approved items and rewrites catalog.json.
// The editor page calls this right after approve_catalog_submission(). Editors only.
//
// Secrets: GITHUB_DISPATCH_TOKEN (a fine-grained token for the repo with Contents: read and write, which is what
// repository_dispatch needs) and GITHUB_REPO ("PedalPlayground/pedalplayground"). See docs/catalog-backend.md.
//
// Answers { started: true, run_url }: the run's page on GitHub, so the editor page can link to it. repository_dispatch
// doesn't say which run it started, so this looks for the newest one created since. If it doesn't show up within a few
// seconds, run_url is the workflow's list of runs instead. (Listing runs works with the same token while the repo is
// public; a private repo would also need Actions: read on it.)
import { admin, env, HttpError, requireUser } from "../_shared/supabase.ts";
import { handler } from "../_shared/http.ts";

Deno.serve(
  handler(async (req) => {
    const user = await requireUser(req);
    const { data: editor, error } = await admin.from("catalog_editors").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!editor) throw new HttpError(403, "Only catalog editors can publish.");

    const repo = env("GITHUB_REPO");
    const headers = {
      Authorization: `Bearer ${env("GITHUB_DISPATCH_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pedalplayground-catalog-publish",
    };
    // A little before now, in case GitHub's clock is behind ours.
    const since = new Date(Date.now() - 10_000).toISOString();
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers,
      body: JSON.stringify({ event_type: "catalog-publish", client_payload: { requested_by: user.id } }),
    });
    // GitHub answers 204 No Content when the run is queued.
    if (res.status !== 204) {
      console.error("repository_dispatch failed", res.status, await res.text());
      throw new HttpError(502, "Couldn't start the publish. Try again in a minute.");
    }
    return { started: true, run_url: (await findRun(repo, headers, since)) ?? `https://github.com/${repo}/actions/workflows/${WORKFLOW}` };
  }),
);

const WORKFLOW = "catalog-publish.yml";

/** The page of the newest dispatched publish run created since `since`, checking for up to about 5 seconds. */
async function findRun(repo: string, headers: Record<string, string>, since: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/runs?event=repository_dispatch&per_page=1&created=${encodeURIComponent(`>=${since}`)}`;
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) {
        console.error("listing runs failed", r.status, await r.text());
        return null;
      }
      const run = ((await r.json()) as { workflow_runs?: { html_url?: string }[] }).workflow_runs?.[0];
      if (run?.html_url) return run.html_url;
    } catch (e) {
      console.error("listing runs failed", e);
      return null;
    }
  }
  return null;
}
