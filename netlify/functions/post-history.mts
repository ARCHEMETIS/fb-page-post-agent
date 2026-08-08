import { timingSafeEqual } from "node:crypto";

import type { Config, Context } from "@netlify/functions";

import { readHistory } from "./_shared/history.js";
import { requireEnv } from "./_shared/env.js";

function secretsMatch(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
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

  const history = await readHistory();
  return Response.json({ history });
};

export const config: Config = {
  path: "/post-history",
};
