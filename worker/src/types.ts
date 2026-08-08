export interface Env {
  DRAFTS: KVNamespace;
  SUBMIT_DRAFT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_CHANNEL_ID: string;
  FACEBOOK_PAGE_ID?: string;
  FACEBOOK_PAGE_ACCESS_TOKEN?: string;
}

export interface StoredDraft {
  text: string;
  title: string;
  createdAt: string;
}

export interface HistoryEntry {
  date: string;
  title: string;
  text: string;
}
