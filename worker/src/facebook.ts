import type { Env, StoredDraft } from "./types";

// Pin the Graph API version deliberately rather than tracking the default, so a Meta release
// can't change behaviour under us. Meta retires versions after roughly two years — revisit
// this before v21 reaches end of life.
const GRAPH_API_VERSION = "v21.0";

interface FacebookResponse {
  id?: string;
  post_id?: string;
  error?: { message?: string };
}

// Publishes the caption as a text post. Images are no longer generated (the rasteriser could
// not render Thai correctly), so any visual is attached by hand on the Page afterwards.
export async function publishToFacebook(
  env: Env,
  draft: StoredDraft,
): Promise<{ postId: string }> {
  if (!env.FACEBOOK_PAGE_ID || !env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    throw new Error("Facebook publishing is not configured yet");
  }

  const form = new FormData();
  form.append("message", draft.text);
  form.append("access_token", env.FACEBOOK_PAGE_ACCESS_TOKEN);

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(env.FACEBOOK_PAGE_ID)}/feed`,
    { method: "POST", body: form },
  );
  const result = (await response.json()) as FacebookResponse;

  if (result.error) {
    throw new Error(result.error.message || "Facebook returned an unknown error");
  }

  const postId = result.post_id ?? result.id;
  if (!response.ok || !postId) {
    throw new Error(`Facebook API request failed (${response.status})`);
  }

  return { postId };
}
