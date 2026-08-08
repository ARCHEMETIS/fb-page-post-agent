export interface StoredDraft {
  text: string;
  imagePng: string;
  createdAt: string;
}

export interface HistoryEntry {
  date: string;
  title: string;
  text: string;
}
