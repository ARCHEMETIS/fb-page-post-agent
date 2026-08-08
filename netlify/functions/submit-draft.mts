import { randomUUID, timingSafeEqual } from "node:crypto";

import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

import { postDraftToDiscord } from "./_shared/discord.js";
import { requireEnv } from "./_shared/env.js";
import { renderCard } from "./_shared/image-card.js";
import type { StoredDraft } from "./_shared/types.js";

interface SubmitDraftBody {
  text: string;
  image: {
    title: string;
    subtitle?: string;
    sourceUrl?: string;
  };
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

function secretsMatch(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }

  let submitSecret: string;
  try {
    submitSecret = requireEnv("SUBMIT_DRAFT_SECRET");
  } catch (error) {
    console.error(error);
    return new Response("Server configuration error", { status: 500 });
  }

  if (!secretsMatch(req.headers.get("x-api-key"), submitSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!isSubmitDraftBody(body)) {
    return Response.json(
      { error: "Body must contain text and image.title strings; subtitle and sourceUrl are optional strings" },
      { status: 400 },
    );
  }

  try {
    const imagePng = await renderCard(body.image);
    const id = randomUUID();
    const draft: StoredDraft = {
      text: body.text,
      imagePng: imagePng.toString("base64"),
      createdAt: new Date().toISOString(),
    };
    const store = getStore({ name: "drafts" });

    await store.setJSON(id, draft);
    await postDraftToDiscord(id, body.text, imagePng);

    return Response.json({ id });
  } catch (error) {
    console.error("Unable to submit draft", error);
    return Response.json({ error: "Unable to submit draft" }, { status: 502 });
  }
};

export const config: Config = {
  path: "/submit-draft",
};
