import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle } from "./titles";

const t = (raw: string) => cleanTitle(raw).title;

test("the circle, event, language, group and format flags around a title are dropped", () => {
  assert.equal(t("[Jackov] Bratty Sister Correction"), "Bratty Sister Correction");
  assert.equal(t("[Great Mosu] Seiso Kanojo, Ochiru. II [English]"), "Seiso Kanojo, Ochiru. II");
  assert.equal(t("[Syunichi Kansuu (Syunichi)] Gachihame SEX Shidou 4 [Digital]"), "Gachihame SEX Shidou 4");
  assert.equal(t("(C93) [Shinjugai (Takeda Hiromitsu)] Himawari wa Yoru ni Saku [English] {doujins.com}"), "Himawari wa Yoru ni Saku");
  assert.equal(t("[Aomori Ringo (Various)] Botetama Matamaty LOVE (Gintama) [French] {hentailuxe.com} [Decensored] [Digital]"), "Botetama Matamaty LOVE (Gintama)");
  assert.equal(t("[Chococornet (Tenro Aya)] Oathbreaker Zenpen Ingyaku no Kinoe Kishi [English] [SCANMTL] [Digital]"), "Oathbreaker Zenpen Ingyaku no Kinoe Kishi");
});

test("a translated title wins over the original, which is kept aside", () => {
  const c = cleanTitle("[ANKO] InCha na Osananajimi o Netoru Hanashi | 내성적인 소꿉친구 빼앗는 이야기 [Korean]");
  assert.equal(c.title, "내성적인 소꿉친구 빼앗는 이야기");
  assert.equal(c.original, "InCha na Osananajimi o Netoru Hanashi");
  assert.equal(c.lead, "ANKO");
  assert.equal(t("[Nanashidori] Imouto | Little Sis [English] [Crystallized]"), "Little Sis");
  assert.equal(t("Okaasan ni wa Kore Gurai Shika Dekinaikara｜Porque lo ÚNICO que puede hacer mi MADRE es INCESTO..."), "Porque lo ÚNICO que puede hacer mi MADRE es INCESTO...");
  assert.equal(cleanTitle("Tonde Hi ni Iru | Una polilla a la flama").original, "Tonde Hi ni Iru");
});

test("a parody in parentheses stays, a format flag in parentheses goes", () => {
  assert.equal(t("[Popochin] Wakamo 1 (Blue Archive) [French] [Sloth]"), "Wakamo 1 (Blue Archive)");
  assert.equal(t("Hebi to Kumo (decensored)"), "Hebi to Kumo");
  assert.equal(t("[Yamamoto] lots of sex in the future! Bulma and Gohan manga colors (colorized) [Decensored]"), "lots of sex in the future! Bulma and Gohan manga colors");
  assert.equal(t("Midgard (Kuroinu Juu)"), "Midgard (Kuroinu Juu)");
});

test("CJK and mixed bracket styles", () => {
  assert.equal(t("[フグタ家] ボーイッシュ幼なじみと付き合った日にセックスするだけ"), "ボーイッシュ幼なじみと付き合った日にセックスするだけ");
  assert.equal(t("[Hinaeron]미시맘 레슬러 VS 일진 - 내 엄마가 일진들에게 완전 굴복해버리는 이야기[Korean]"), "미시맘 레슬러 VS 일진 - 내 엄마가 일진들에게 완전 굴복해버리는 이야기");
  assert.equal(t("[関西オレンジ (荒井啓)] 僕の先輩彼女はオタサーの姫になる [無修正]"), "僕の先輩彼女はオタサーの姫になる");
  assert.equal(t("[Aiue Oka] FamiCon - Family Control Ch.1-4 [Chinese] [洨五組]"), "FamiCon - Family Control Ch.1-4");
  assert.equal(t("(Kirtu) Savita in Goa - Chapter 2"), "Savita in Goa - Chapter 2");
});

test("a title that is only a number takes its circle in front, so it still names something", () => {
  assert.equal(t("[820] 112 [Korean]"), "820 - 112");
  assert.equal(t("[Anthology] 2D Comic Magazine Futanari Saiin Anji Anata ga Papa ni Narun Dayo? Vol.1 [Chinese] [Digital]"), "2D Comic Magazine Futanari Saiin Anji Anata ga Papa ni Narun Dayo? Vol.1");
});

test("a title made only of brackets keeps its words, and an already clean title is untouched", () => {
  assert.equal(t("[Oshi no Ko]"), "Oshi no Ko");
  assert.equal(t("Welcome to Tokoharusou"), "Welcome to Tokoharusou");
  assert.equal(t("Fern..."), "Fern...");
  assert.equal(t("Gohoubi wa Karada de. ~Ero-sugi Fukuri Kousei~"), "Gohoubi wa Karada de. ~Ero-sugi Fukuri Kousei~");
  assert.equal(t("Hidden memory"), "Hidden memory");
});

test("web addresses never survive in a title, but a dot in a name is not an address", () => {
  assert.equal(t("Title here www.example.com"), "Title here");
  assert.equal(t("[Yue] Hidden Gem [2d-market.com] [English]"), "Hidden Gem");
  assert.equal(t("Sex.to Love"), "Sex.to Love");
  assert.equal(t("Mr.Me goes out"), "Mr.Me goes out");
});

test("never returns an empty title", () => {
  for (const raw of ["[]", "[English]", "{x.com}", "   ", "(C101)", "[a] | [b]"]) assert.ok(cleanTitle(raw).title.length > 0, raw);
});

test("a | inside a bracket block is part of the circle name, not a title separator", () => {
  assert.equal(t("[远德 | 遠德] 韶恩 1-113 [Chinese] [Ongoing]"), "韶恩 1-113");
  assert.equal(t("[Ranshi to Kimi to. (santa)] Kanojo Saimin 3 | Hypnosis Girlfriend 3 [English] [PHILO] [Digital] + Omake"), "Hypnosis Girlfriend 3 + Omake");
});

test("stacked leading blocks and events, and a title that lost its opening bracket", () => {
  assert.equal(t("[超勇漢化組×禁漫天堂](C108)[M45(pleia)]Chun Chun Sparrow(崩壊スターレイル)[中国翻訳]"), "Chun Chun Sparrow(崩壊スターレイル)");
  assert.equal(t("Studio Daiya (Nemui Neru)] Suki Araba Hentai Play [Digital]"), "Suki Araba Hentai Play");
  assert.equal(t("[Raccoon21] December,Twilight,Snowflake [Chinese] [HD] (2026.08)"), "December,Twilight,Snowflake");
});
