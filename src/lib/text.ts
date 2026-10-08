/**
 * Source descriptions arrive as raw Markdown, often with credits and links after a horizontal rule
 * ("**Character Designer:** [name](https://...)"). Show the story, not the markup.
 */
export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/\r/g, "");
  // credits and links conventionally follow a horizontal rule: keep only what comes before it
  s = s.split(/(?:^|\n)[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*(?:\n|$)/)[0];
  s = s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/<?https?:\/\/[^\s>)]+>?/g, "") // bare links
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2") // bold
    .replace(/\*(?=\S)([^*\n]+?)(?<=\S)\*/g, "$1") // italic
    .replace(/^#{1,6}\s*/gm, "") // headings
    .replace(/^\s*>\s?/gm, "") // quotes
    .replace(/`/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > 3 ? s.slice(0, 1200) : null;
}
