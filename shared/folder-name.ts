/**
 * Folder names for chats: `<YYYY-MM-DD>/<slug>-<id>`. The date is a bucket directory so one
 * folder never collects thousands of entries; the slug is the first few words of the first
 * message, so a chat is recognisable in a file manager. Renaming a chat never renames it.
 */

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const MAX_WORDS = 5;
const MAX_SLUG = 40;

/** ASCII words of the first message; empty for text with none (e.g. Chinese), which then uses the id alone. */
export function messageSlug(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS)
    .join("-")
    .slice(0, MAX_SLUG)
    .replace(/-+$/, "");
  return WINDOWS_RESERVED.test(slug) ? `${slug}-chat` : slug;
}

/** Local calendar day, the same day the user sees on their clock. */
export function dayBucket(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function chatFolderName(text: string, id: string): string {
  const slug = messageSlug(text);
  return slug ? `${slug}-${id}` : id;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LEAF = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?[a-z0-9]{8,}$/;

/** Whether `segments` (relative to a chat root) is exactly the shape this plugin creates. */
export function isChatFolderShape(segments: readonly string[]): boolean {
  return segments.length === 2 && DAY.test(segments[0] ?? "") && LEAF.test(segments[1] ?? "");
}
