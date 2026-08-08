import { getStore } from "@netlify/blobs";

import type { HistoryEntry } from "./types.js";

const HISTORY_KEY = "log";
const MAX_ENTRIES = 30;

export async function readHistory(): Promise<HistoryEntry[]> {
  const store = getStore({ name: "history" });
  const entries = await store.get(HISTORY_KEY, { type: "json", consistency: "strong" });
  return Array.isArray(entries) ? (entries as HistoryEntry[]) : [];
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const store = getStore({ name: "history", consistency: "strong" });
  const existing = await readHistory();
  const updated = [...existing, entry].slice(-MAX_ENTRIES);
  await store.setJSON(HISTORY_KEY, updated);
}
