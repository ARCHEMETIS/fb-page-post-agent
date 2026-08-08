import { postDraftToDiscord, editOriginalInteraction } from "./discord";
import { publishToFacebook } from "./facebook";
import { appendHistory, readHistory } from "./history";
import type { Env, StoredDraft } from "./types";
import { requireEnv, secretsMatch, truncate } from "./utils";

interface SubmitDraftBody {
  text: string;
  image: { title: string; subtitle?: string; sourceUrl?: string };
}

interface DiscordInteraction {
  type: number;
  application_id?: string;
  token?: string;
  data?: { custom_id?: string; name?: string };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSubmitDraftBody(value: unknown): value is SubmitDraftBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (!isNonEmptyString(body.text) || !body.image || typeof body.image !== "object") return false;

  const image = body.image as Record<string, unknown>;
  return (
    isNonEmptyString(image.title) &&
    (image.subtitle === undefined || typeof image.subtitle === "string") &&
    (image.sourceUrl === undefined || typeof image.sourceUrl === "string")
  );
}

function methodNotAllowed(method: string): Response {
  return new Response("Method not allowed", { status: 405, headers: { Allow: method } });
}

function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal value");
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function verifyDiscordSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKey: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const signedBody = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToBytes(signature),
      signedBody,
    );
  } catch {
    return false;
  }
}

async function listDraftKeys(env: Env): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.DRAFTS.list({ prefix: "draft:", cursor });
    names.push(...page.keys.map((key) => key.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names;
}

async function handleSubmitDraft(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");

  let submitSecret: string;
  try {
    submitSecret = requireEnv(env.SUBMIT_DRAFT_SECRET, "SUBMIT_DRAFT_SECRET");
  } catch (error) {
    console.error(error);
    return new Response("Server configuration error", { status: 500 });
  }

  if (!secretsMatch(request.headers.get("x-api-key"), submitSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!isSubmitDraftBody(body)) {
    return Response.json(
      { error: "Body must contain text and image.title strings; subtitle and sourceUrl are optional strings" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const key = `draft:${id}`;
  const draft: StoredDraft = {
    text: body.text,
    title: body.image.title,
    createdAt: new Date().toISOString(),
  };

  try {
    // The draft must exist before the buttons referencing it do, otherwise a fast click finds
    // nothing. If Discord then fails, roll the write back so the key can't be orphaned — a
    // retry would otherwise leave a second copy behind with no message pointing at it.
    await env.DRAFTS.put(key, JSON.stringify(draft));
    try {
      await postDraftToDiscord(env, id, body.text);
    } catch (discordError) {
      await env.DRAFTS.delete(key).catch((cleanupError) => {
        console.error("Orphaned draft left in KV", key, cleanupError);
      });
      throw discordError;
    }

    try {
      await appendHistory(env, { date: draft.createdAt, title: draft.title, text: draft.text });
    } catch (historyError) {
      console.error("Unable to append post history", historyError);
    }

    return Response.json({ id });
  } catch (error) {
    console.error("Unable to submit draft", error);
    return Response.json({ error: "Unable to submit draft" }, { status: 502 });
  }
}

async function handlePostHistory(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed("GET");

  let submitSecret: string;
  try {
    submitSecret = requireEnv(env.SUBMIT_DRAFT_SECRET, "SUBMIT_DRAFT_SECRET");
  } catch (error) {
    console.error(error);
    return new Response("Server configuration error", { status: 500 });
  }

  if (!secretsMatch(request.headers.get("x-api-key"), submitSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json({ history: await readHistory(env) });
}

function ephemeral(content: string): Response {
  return Response.json({ type: 4, data: { content: truncate(content, 2_000), flags: 64 } });
}

async function handleCommand(name: string | undefined, env: Env): Promise<Response> {
  if (name === "status") {
    const draftCount = (await listDraftKeys(env)).length;
    const facebookStatus = env.FACEBOOK_PAGE_ID && env.FACEBOOK_PAGE_ACCESS_TOKEN
      ? "configured"
      : "not configured";
    return ephemeral(
      `${draftCount} draft${draftCount === 1 ? "" : "s"} awaiting approval. Facebook publishing: ${facebookStatus}.`,
    );
  }

  if (name === "history") {
    const entries = (await readHistory(env)).slice(-5).reverse();
    if (entries.length === 0) return ephemeral("Post history is empty.");
    return ephemeral(entries.map((entry) => `${entry.date} — ${entry.title}`).join("\n"));
  }

  if (name === "pending") {
    const keys = await listDraftKeys(env);
    const drafts = await Promise.all(
      keys.map(async (key) => ({
        id: key.slice("draft:".length),
        draft: await env.DRAFTS.get<StoredDraft>(key, "json"),
      })),
    );
    const existing = drafts.filter(
      (entry): entry is { id: string; draft: StoredDraft } => entry.draft !== null,
    );
    if (existing.length === 0) return ephemeral("No drafts are awaiting approval.");
    existing.sort((left, right) => left.draft.createdAt.localeCompare(right.draft.createdAt));
    return ephemeral(
      existing
        .map(({ id, draft }) => `${id.slice(0, 8)} | ${draft.createdAt} | ${truncate(draft.text, 60)}`)
        .join("\n"),
    );
  }

  return new Response("Unsupported command", { status: 400 });
}

function publishingError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return truncate(`Publishing failed: ${message}`, 2_000);
}

async function processComponent(
  env: Env,
  action: string,
  id: string,
  applicationId: string,
  interactionToken: string,
): Promise<void> {
  const key = `draft:${id}`;
  const draft = await env.DRAFTS.get<StoredDraft>(key, "json");

  if (!draft) {
    await editOriginalInteraction(applicationId, interactionToken, "Draft is gone or already handled.");
    return;
  }

  if (action === "reject") {
    await env.DRAFTS.delete(key);
    await editOriginalInteraction(applicationId, interactionToken, "Rejected");
    return;
  }

  try {
    const { postId } = await publishToFacebook(env, draft);
    await env.DRAFTS.delete(key);
    await editOriginalInteraction(
      applicationId,
      interactionToken,
      `Published to Facebook Page (post id: ${postId})`,
    );
  } catch (error) {
    console.error("Facebook publishing failed", error);
    await editOriginalInteraction(applicationId, interactionToken, publishingError(error));
  }
}

async function handleDiscordInteraction(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");

  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const rawBody = await request.text();
  if (!signature || !timestamp) {
    return new Response("Invalid request signature", { status: 401 });
  }

  let publicKey: string;
  try {
    publicKey = requireEnv(env.DISCORD_PUBLIC_KEY, "DISCORD_PUBLIC_KEY");
  } catch (error) {
    console.error(error);
    return new Response("Server configuration error", { status: 500 });
  }

  if (!(await verifyDiscordSignature(rawBody, signature, timestamp, publicKey))) {
    return new Response("Invalid request signature", { status: 401 });
  }

  let body: DiscordInteraction;
  try {
    body = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (body.type === 1) return Response.json({ type: 1 });
  if (body.type === 2) return handleCommand(body.data?.name, env);

  if (body.type === 3 && body.data?.custom_id) {
    const match = /^(approve|reject):([0-9a-f-]+)$/i.exec(body.data.custom_id);
    if (!match) return new Response("Unsupported component", { status: 400 });
    if (!body.application_id || !body.token) {
      return new Response("Invalid component interaction", { status: 400 });
    }

    const [, rawAction, id] = match;
    const action = rawAction.toLowerCase();
    ctx.waitUntil(
      processComponent(env, action, id, body.application_id, body.token).catch((error) => {
        console.error("Unable to process Discord component", error);
      }),
    );
    return Response.json({ type: 6 });
  }

  return new Response("Unsupported interaction", { status: 400 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/submit-draft") return handleSubmitDraft(request, env);
    if (pathname === "/post-history") return handlePostHistory(request, env);
    if (pathname === "/discord-interactions") return handleDiscordInteraction(request, env, ctx);
    return new Response("Not found", { status: 404 });
  },
};
