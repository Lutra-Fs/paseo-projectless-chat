const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A one-time key for one New chat page. Not a secret: it only makes retries idempotent. */
export function newNonce(): string {
  let out = Date.now().toString(36);
  for (let i = 0; i < 12; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}
