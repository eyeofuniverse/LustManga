import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { UnsupportedImageError, dhash, isAvifSequence, toWebp } from "./images";

const still = (w = 320, h = 480) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 40 } } });

test("a PNG and a JPEG convert to WebP with the right size and a perceptual hash", async () => {
  for (const fmt of ["png", "jpeg"] as const) {
    const buf = await still()[fmt]().toBuffer();
    const out = await toWebp(buf);
    assert.equal((await sharp(out.data).metadata()).format, "webp");
    assert.deepEqual([out.width, out.height], [320, 480]);
    assert.match(out.phash, /^[0-9a-f]{16}$/);
    assert.equal(out.animated, false);
  }
});

test("a still AVIF decodes (Hitomi serves AVIF)", async () => {
  const avif = await still(200, 300).avif().toBuffer();
  const out = await toWebp(avif);
  assert.deepEqual([out.width, out.height], [200, 300]);
});

test("a valid image of a few hundred bytes is accepted (regression: a 500-byte floor rejected blank pages)", async () => {
  // a genuine 1x1 PNG, ~70 bytes: far under the old floor, and still a real image
  const tiny = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
  assert.ok(tiny.length > 24 && tiny.length < 500, `fixture size ${tiny.length}`);
  const out = await toWebp(tiny);
  assert.deepEqual([out.width, out.height], [1, 1]);
});

test("truncated and tiny files are rejected instead of being stored", async () => {
  const buf = await still(800, 1200).jpeg().toBuffer();
  await assert.rejects(() => toWebp(buf.subarray(0, Math.floor(buf.length / 3))));
  await assert.rejects(() => toWebp(Buffer.from("not an image")), /too small/);
});

test("very tall pages (webtoon strips) are scaled to fit the WebP limit", async () => {
  const tall = await still(700, 20000).png().toBuffer();
  const out = await toWebp(tall);
  assert.ok(out.height <= 16383, `height ${out.height}`);
});

test("maxWidth scales covers down", async () => {
  const out = await toWebp(await still(1600, 2400).jpeg().toBuffer(), { maxWidth: 600 });
  assert.equal(out.width, 600);
});

test("animated WebP keeps its animation", async () => {
  const w = 64, h = 64, frames = 4;
  const raw = Buffer.concat(Array.from({ length: frames }, (_, i) => Buffer.alloc(w * h * 3, i * 60)));
  const animated = await sharp(raw, { raw: { width: w, height: h * frames, channels: 3, pageHeight: h } }).webp({ loop: 0, delay: [100, 100, 100, 100] }).toBuffer();
  assert.ok(((await sharp(animated).metadata()).pages ?? 1) > 1, "fixture should be animated");
  const out = await toWebp(animated);
  assert.equal(out.animated, true);
  assert.ok(((await sharp(out.data).metadata()).pages ?? 1) > 1, "output should still be animated");
});

test("animated AVIF is detected and reported as unsupported (the caller stores it untouched)", async () => {
  const fake = Buffer.alloc(900);
  fake.write("ftypavis", 4, "latin1");
  assert.equal(isAvifSequence(fake), true);
  await assert.rejects(() => toWebp(fake), UnsupportedImageError);
  assert.equal(isAvifSequence(await still().avif().toBuffer()), false);
});

test("dHash is stable, and differs for different images", async () => {
  const a = await sharp({ create: { width: 90, height: 90, channels: 3, background: "#fff" } }).composite([{ input: await sharp({ create: { width: 45, height: 90, channels: 3, background: "#000" } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  const b = await sharp(a).flop().png().toBuffer();
  assert.equal(await dhash(a), await dhash(a));
  assert.notEqual(await dhash(a), await dhash(b));
});

const noisy = (w = 600, h = 900) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 55 } } }).jpeg({ quality: 90 }).toBuffer();

test("a real-sized JPEG missing only its last bytes is kept (and flagged), not allowed to sink the whole chapter", async () => {
  const full = await noisy();
  assert.ok(full.length > 20_000, `fixture size ${full.length}`);
  const out = await toWebp(full.subarray(0, full.length - Math.ceil(full.length * 0.004)));
  assert.equal(out.truncated, true);
  assert.deepEqual([out.width, out.height], [600, 900]);
  assert.equal((await toWebp(full)).truncated, undefined, "a complete file is not flagged");
});

test("a JPEG cut off well before its end keeps the part that arrived, flagged, as the source's own readers see it", async () => {
  const full = await noisy();
  const out = await toWebp(full.subarray(0, Math.floor(full.length * 0.4)));
  assert.equal(out.truncated, true);
  assert.deepEqual([out.width, out.height], [600, 900]);
});

test("a stub with almost none of the picture is rejected, however it fails", async () => {
  const big = await noisy(2000, 3000);
  await assert.rejects(() => toWebp(big.subarray(0, Math.floor(big.length * 0.01))), /premature end|truncated/i); // real size, but under 3% of the page
  await assert.rejects(() => toWebp(big.subarray(0, 8000)), /premature end|truncated/i); // too small to be a page
});

test("an animation with more pixels than libvips will decode keeps its first frame instead of failing", async () => {
  const w = 64, h = 64, frames = 4;
  const raw = Buffer.concat(Array.from({ length: frames }, (_, i) => Buffer.alloc(w * h * 3, i * 60)));
  const animated = await sharp(raw, { raw: { width: w, height: h * frames, channels: 3, pageHeight: h } }).webp({ loop: 0, delay: [100, 100, 100, 100] }).toBuffer();
  const out = await toWebp(animated, { maxPixels: w * h * 2 }); // 4 frames of 64x64 = 16384 px, over the 8192 budget
  assert.equal(out.animated, false);
  assert.deepEqual([out.width, out.height], [w, h]);
  assert.equal(((await sharp(out.data).metadata()).pages ?? 1), 1);
});
