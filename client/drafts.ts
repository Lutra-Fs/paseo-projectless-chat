/** Unsent first messages by page nonce, for this app session: leaving and returning keeps the text. */
const drafts = new Map<string, string>();

export const readDraft = (nonce: string) => drafts.get(nonce) ?? "";
export function writeDraft(nonce: string, text: string): void {
  if (text) drafts.set(nonce, text);
  else drafts.delete(nonce);
}
export const clearDrafts = () => drafts.clear();
