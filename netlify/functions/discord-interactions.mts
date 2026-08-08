import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { verifyKey } from "discord-interactions";

import { requireEnv } from "./_shared/env.js";
import { publishToFacebook } from "./_shared/facebook.js";
import type { StoredDraft } from "./_shared/types.js";

interface DiscordInteraction {
  type: number;
  data?: { custom_id?: string };
}

function updateMessage(content: string): Response {
  return Response.json({ type: 7, data: { content, components: [] } });
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  const content = `Publishing failed: ${message}`;
  return content.length <= 2_000 ? content : `${content.slice(0, 1_999)}…`;
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");
  const rawBody = await req.text();

  if (!signature || !timestamp) {
    return new Response("Invalid request signature", { status: 401 });
  }

  let publicKey: string;
  try {
    publicKey = requireEnv("DISCORD_PUBLIC_KEY");
  } catch (error) {
    console.error(error);
    return new Response("Server configuration error", { status: 500 });
  }

  let verified = false;
  try {
    verified = await verifyKey(rawBody, signature, timestamp, publicKey);
  } catch {
    verified = false;
  }

  if (!verified) {
    return new Response("Invalid request signature", { status: 401 });
  }

  let body: DiscordInteraction;
  try {
    body = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (body.type === 1) {
    return Response.json({ type: 1 });
  }

  if (body.type !== 3 || !body.data?.custom_id) {
    return new Response("Unsupported interaction", { status: 400 });
  }

  const match = /^(approve|reject):([0-9a-f-]+)$/i.exec(body.data.custom_id);
  if (!match) {
    return new Response("Unsupported component", { status: 400 });
  }

  const [, action, id] = match;
  const store = getStore({ name: "drafts" });
  const draft = (await store.get(id, {
    type: "json",
    consistency: "strong",
  })) as StoredDraft | null;

  if (!draft) {
    return updateMessage("Draft is gone or already handled.");
  }

  if (action.toLowerCase() === "reject") {
    await store.delete(id);
    return updateMessage("Rejected");
  }

  try {
    await publishToFacebook(draft);
    await store.delete(id);
    return updateMessage("Published to Facebook Page");
  } catch (error) {
    console.error("Facebook publishing failed", error);
    return updateMessage(errorMessage(error));
  }
};

export const config: Config = {
  path: "/discord-interactions",
};
