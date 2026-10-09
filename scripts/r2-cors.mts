// Lets the site's JavaScript read images from the image host (fetch needs CORS; <img> does not). Required for
// "Download chapter": the browser fetches the pages and zips them itself. Read-only (GET/HEAD) for any origin,
// which is what <img> hotlinking already allowed.   npx tsx --env-file=.env scripts/r2-cors.mts   (add --show to only print)
import { AwsClient } from "aws4fetch";

const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET } = process.env;
if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET) throw new Error("R2 env vars missing");
const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
const url = `${R2_ENDPOINT}/${R2_BUCKET}?cors`;

if (!process.argv.includes("--show")) {
  const body =
    `<CORSConfiguration><CORSRule>` +
    `<AllowedOrigin>*</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod>` +
    `<AllowedHeader>*</AllowedHeader><ExposeHeader>Content-Length</ExposeHeader><MaxAgeSeconds>86400</MaxAgeSeconds>` +
    `</CORSRule></CORSConfiguration>`;
  const put = await client.fetch(url, { method: "PUT", body, headers: { "content-type": "application/xml" } });
  console.log(`PutBucketCors: HTTP ${put.status}${put.ok ? "" : " " + (await put.text()).slice(0, 200)}`);
}
const get = await client.fetch(url);
console.log(`GetBucketCors: HTTP ${get.status}\n${(await get.text()).slice(0, 400)}`);
