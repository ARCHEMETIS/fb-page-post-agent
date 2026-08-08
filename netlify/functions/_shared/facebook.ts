import { requireEnv } from "./env.js";

export interface FacebookDraft {
  text: string;
  imagePng: string;
}

interface FacebookResponse {
  id?: string;
  post_id?: string;
  error?: { message?: string };
}

export async function publishToFacebook(draft: FacebookDraft): Promise<{ postId: string }> {
  const pageId = requireEnv("FACEBOOK_PAGE_ID");
  const accessToken = requireEnv("FACEBOOK_PAGE_ACCESS_TOKEN");
  const imageBytes = Uint8Array.from(Buffer.from(draft.imagePng, "base64"));
  const form = new FormData();

  form.append("caption", draft.text);
  form.append("access_token", accessToken);
  form.append("source", new Blob([imageBytes], { type: "image/png" }), "post.png");

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/photos`,
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
