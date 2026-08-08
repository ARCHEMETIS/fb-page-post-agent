import type { Env, StoredDraft } from "./types";
import { base64ToBytes } from "./utils";

interface FacebookResponse {
  id?: string;
  post_id?: string;
  error?: { message?: string };
}

export async function publishToFacebook(
  env: Env,
  draft: StoredDraft,
): Promise<{ postId: string }> {
  if (!env.FACEBOOK_PAGE_ID || !env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    throw new Error("Facebook publishing is not configured yet");
  }

  const imageBytes = base64ToBytes(draft.imagePng);
  const form = new FormData();
  form.append("caption", draft.text);
  form.append("access_token", env.FACEBOOK_PAGE_ACCESS_TOKEN);
  form.append("source", new Blob([imageBytes], { type: "image/png" }), "post.png");

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(env.FACEBOOK_PAGE_ID)}/photos`,
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
