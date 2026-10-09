import { authenticator } from "otplib";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

authenticator.options = { window: 1 }; // tolerate ±30s clock drift

export function newTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "LustPages Console", secret);
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ""), secret });
  } catch {
    return false;
  }
}

/** 10 single-use recovery codes. Returns the plaintext (show once) + bcrypt
 *  hashes to persist. */
export async function newBackupCodes(): Promise<{ plain: string[]; hashes: string[] }> {
  const plain = Array.from({ length: 10 }, () => {
    const raw = randomBytes(5).toString("hex"); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  const hashes = await Promise.all(plain.map((c) => bcrypt.hash(c, 10)));
  return { plain, hashes };
}

/** Returns the index of the matched hash (to remove it), or -1. */
export async function matchBackupCode(hashes: string[], code: string): Promise<number> {
  const norm = code.trim().toLowerCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(norm, hashes[i])) return i;
  }
  return -1;
}
