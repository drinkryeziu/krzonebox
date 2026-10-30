import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

function key(): Buffer {
  const k = Buffer.from(env.encryptionKey(), "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return k;
}

/** Encrypts a JSON value with AES-256-GCM. Output: base64(iv|tag|ciphertext). */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptJson<T>(blob: string): T {
  const raw = Buffer.from(blob, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  const pt = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

/** Constant-time compare of an HMAC-SHA256 hex digest. */
export function hmacMatches(secret: string, payload: string, expectedHex: string): boolean {
  const digest = createHmac("sha256", secret).update(payload, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  return given.length === digest.length && timingSafeEqual(given, digest);
}

/** Signed, short-lived state for OAuth redirects (binds the callback to the user who started it). */
export function signState(data: Record<string, string>): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): Record<string, string> | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
  return data;
}
