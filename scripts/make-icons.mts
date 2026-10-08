// Draws the site icons from the logo mark. Re-run only if the logo changes:  npx tsx scripts/make-icons.mts
//   src/app/icon.png          512px, rounded       (browsers, Google search results)
//   src/app/apple-icon.png    180px, full square   (iOS home screen rounds it itself)
//   src/app/favicon.ico       48px PNG-in-ICO      (legacy /favicon.ico requests; Google wants multiples of 48)
//   public/maskable-icon.png  512px, full bleed with the mark inside the safe zone (Android adaptive icons)
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const ACCENT = "#ff4785";
const ACCENT_2 = "#8b5cf6";

/** the mark is drawn on a 24-unit grid: a book spine with two lines of text */
const mark = (size: number, x: number, y: number) => {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v13a3 3 0 0 0 3 3h9"/><path d="M10 8h7M10 12h4"/></g>`;
};

const svg = (px: number, radius: number, markSize: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="${ACCENT_2}"/></linearGradient></defs>
      <rect width="${px}" height="${px}" rx="${radius}" fill="url(#g)"/>
      ${mark(markSize, (px - markSize) / 2, (px - markSize) / 2)}
    </svg>`,
  );

const png = (px: number, radius: number, markSize: number) => sharp(svg(px, radius, markSize)).png({ compressionLevel: 9 }).toBuffer();

/** An .ico file is a small header plus the images; modern ICOs can hold PNG data directly. */
function ico(image: Buffer, px: number): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(px, 6); // width
  header.writeUInt8(px, 7); // height
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(image.length, 14); // size of the image data
  header.writeUInt32LE(22, 18); // offset of the image data
  return Buffer.concat([header, image]);
}

writeFileSync("src/app/icon.png", await png(512, 112, 280));
writeFileSync("src/app/apple-icon.png", await png(180, 0, 100));
writeFileSync("src/app/favicon.ico", ico(await png(48, 11, 27), 48));
writeFileSync("public/maskable-icon.png", await png(512, 0, 230));
console.log("icons written");
