/** Beta builds (`vite build --mode beta`, see .env.beta) show a badge and a feedback link and ask not to be indexed. */
export const BETA = import.meta.env.VITE_BETA === "true";
export const FEEDBACK_URL = (import.meta.env.VITE_FEEDBACK_URL as string | undefined) || undefined;

if (BETA) {
  const meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = "noindex, nofollow";
  document.head.appendChild(meta);
}
