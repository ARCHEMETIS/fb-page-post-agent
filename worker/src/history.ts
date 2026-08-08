import type { Env, HistoryEntry } from "./types";

const HISTORY_KEY = "history";
const MAX_ENTRIES = 30;

export async function readHistory(env: Env): Promise<HistoryEntry[]> {
  const entries = await env.DRAFTS.get<HistoryEntry[]>(HISTORY_KEY, "json");
  return Array.isArray(entries) ? entries : [];
}

export async function appendHistory(env: Env, entry: HistoryEntry): Promise<void> {
  const existing = await readHistory(env);
  const updated = [...existing, entry].slice(-MAX_ENTRIES);
  await env.DRAFTS.put(HISTORY_KEY, JSON.stringify(updated));
}
