// Supabase sometimes refuses a request for a moment under load ("Too many connections issued to the database",
// 5xx). Retrying after a short wait gets through, so a long import or publish doesn't lose items to a blip.

/**
 * Runs fn, which returns a supabase-js result ({ data, error }). Retries on an error up to `tries` times in all,
 * waiting longer each time. Returns the last result.
 */
export async function withRetry(fn, { tries = 5, delayMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let result;
  for (let attempt = 1; attempt <= tries; attempt++) {
    result = await fn();
    if (!result.error) return result;
    if (attempt < tries) await sleep(delayMs * 2 ** (attempt - 1));
  }
  return result;
}
