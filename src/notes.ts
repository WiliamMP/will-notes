// Same shape as `Note` in src-tauri/src/notes.rs (serde keeps the snake_case names)
export type Note = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

// Pinned first, then newest. ISO timestamps sort correctly as plain strings
export const newestFirst = (ns: Note[]) =>
  [...ns].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
