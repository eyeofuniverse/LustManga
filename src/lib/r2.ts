import { AwsClient } from "aws4fetch";

let client: AwsClient | null = null;
function cfg() {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET)
    throw new Error("R2 env vars missing (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET)");
  client ??= new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  return { client, base: `${R2_ENDPOINT}/${R2_BUCKET}` };
}

export async function r2Put(key: string, body: Uint8Array, contentType = "image/webp"): Promise<void> {
  const { client, base } = cfg();
  let lastErr = "";
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await client.fetch(`${base}/${key}`, {
        method: "PUT",
        body: body as unknown as BodyInit,
        headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" },
      });
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  throw new Error(`R2 put failed for ${key}: ${lastErr}`);
}

export async function r2Delete(key: string): Promise<void> {
  const { client, base } = cfg();
  await client.fetch(`${base}/${key}`, { method: "DELETE" });
}

export const imgUrl = (key: string) => `https://${process.env.NEXT_PUBLIC_IMG_CDN_HOST}/${key}`;

/** Every object key under a prefix (S3 ListObjectsV2, paginated). */
export async function r2List(prefix: string): Promise<string[]> {
  const { client, base } = cfg();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const url = `${base}?list-type=2&prefix=${encodeURIComponent(prefix)}${token ? `&continuation-token=${encodeURIComponent(token)}` : ""}`;
    const res = await client.fetch(url);
    if (!res.ok) throw new Error(`R2 list failed: HTTP ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
  } while (token);
  return keys;
}
