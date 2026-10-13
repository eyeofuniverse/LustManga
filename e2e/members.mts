// Accounts, ratings and comments, end to end: sign-up and the recovery codes, sign-in and lock-out, the lost-password flow, stars,
// comments (rules, replies, votes, edit, delete, reports and the automatic hide), bans, profiles, deleting an account, the
// console's moderation screen, and the places that must stay out of search engines.
//   (a production server)   BASE_URL=http://localhost:3200 npx tsx --env-file=.env e2e/members.mts
// Everything it creates is named "zztest..." (members) or starts with "zztest" (comments) and is removed again at the end (and at
// the start, if a run was cut short). The comments sit on one real work for a few minutes, so a visitor could see them in that time.
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { chromium, type Page } from "playwright";
import { prisma, db } from "../src/lib/db";

const BASE = (process.env.BASE_URL ?? "http://localhost:3200").replace(/\/$/, "");
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PW = "Passw0rd!zz-test";
const retry = <T,>(fn: () => Promise<T>) => db(fn, 8);

let fails = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? `  [${extra}]` : ""}`);
};

const work = (await retry(() => prisma.work.findFirst({ where: { publish: "PUBLISHED", coverKey: { not: null } }, orderBy: { publicId: "desc" }, select: { id: true, publicId: true, slug: true, ratingSum: true, ratingCount: true } })))!;
const WORK_URL = `${BASE}/g/${work.publicId}-${work.slug}`;
const startRating = { sum: work.ratingSum, count: work.ratingCount };

async function cleanup() {
  await retry(() => prisma.comment.deleteMany({ where: { workId: work.id, OR: [{ body: { startsWith: "zztest" } }, { body: "", memberId: null }] } }));
  await retry(() => prisma.member.deleteMany({ where: { handle: { startsWith: "zztest" } } }));
  // the throttle log of this machine and of the test names (a run must not be slowed down by the one before it)
  await retry(() => prisma.memberAttempt.deleteMany({ where: { createdAt: { gte: new Date(Date.now() - 4 * 3_600_000) }, kind: { in: ["signup", "login", "reset", "rate", "vote", "report", "comment"] } } })).catch(() => {});
  // put the work's own numbers back to what the remaining ratings say
  const agg = await retry(() => prisma.workRating.aggregate({ where: { workId: work.id }, _sum: { value: true }, _count: true }));
  await retry(() => prisma.work.update({ where: { id: work.id }, data: { ratingSum: agg._sum.value ?? 0, ratingCount: agg._count } }));
}

/** A member made straight in the database, with an account old enough not to be held to the new-account pace. */
async function seed(handle: string, o: { ageDays?: number; recovery?: string[]; showRatings?: boolean } = {}) {
  const m = await retry(() =>
    prisma.member.create({
      data: {
        handle: handle.toLowerCase(),
        displayName: handle,
        passwordHash: bcrypt.hashSync(PW, 4),
        recoveryHashes: (o.recovery ?? []).map((c) => bcrypt.hashSync(c.replace(/[^a-z0-9]/g, ""), 4)),
        createdAt: new Date(Date.now() - (o.ageDays ?? 5) * 86_400_000),
        showRatings: o.showRatings ?? false,
      },
    }),
  );
  return m;
}

const browser = await chromium.launch();
const newCtx = async () => {
  const ctx = await browser.newContext({ userAgent: DESKTOP, viewport: { width: 1280, height: 900 }, locale: "en-US" });
  await ctx.addCookies([
    { name: "lm_age", value: "1", url: BASE },
    { name: "lm_nocount", value: "1", url: BASE }, // no ads, no analytics for the test
  ]);
  // wait for the page to settle (the script that makes the buttons work) before the test clicks anything: a fast site is clicked before it is ready
  ctx.on("page", (pg) => {
    const go = pg.goto.bind(pg);
    pg.goto = ((u: string, o?: Parameters<typeof go>[1]) => go(u, { ...o, waitUntil: "networkidle", timeout: 60000 })) as typeof pg.goto;
  });
  return ctx;
};
async function signIn(p: Page, handle: string, pw = PW, next = "") {
  await p.goto(`${BASE}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, { waitUntil: "domcontentloaded" });
  await p.locator("#si-user").fill(handle);
  await p.locator("#si-pass").fill(pw);
  await p.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
}
const text = (p: Page) => p.evaluate(() => document.body.innerText);
/** Poll until the check is true (the database answers after a few round trips); false when it never is. */
const eventually = async (check: () => Promise<boolean>, ms = 25000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
const workNow = () => retry(() => prisma.work.findUnique({ where: { id: work.id }, select: { ratingSum: true, ratingCount: true } }));
// generous: this test runs from a computer far from the database, where each query takes a second or more
const waitText = async (p: Page, re: RegExp, ms = 45000) => {
  try {
    await p.waitForFunction((s) => new RegExp(s, "i").test(document.body.innerText), re.source, { timeout: ms });
    return true;
  } catch {
    return false;
  }
};

await cleanup();
try {
  /* ───────────── pages that must stay out of search results ───────────── */
  console.log("\n— what search engines are told");
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  ok(["/login", "/signup", "/forgot", "/account"].every((p) => robots.includes(`Disallow: ${p}`)), "robots.txt keeps crawlers out of the sign-in, sign-up, reset and account pages", robots.slice(0, 200));
  for (const path of ["/login", "/signup", "/forgot"]) {
    const h = await (await fetch(`${BASE}${path}`, { headers: { "user-agent": DESKTOP } })).text();
    ok(/<meta name="robots" content="noindex/.test(h), `${path} is noindex`);
  }
  const acct = await fetch(`${BASE}/account`, { headers: { "user-agent": DESKTOP }, redirect: "manual" });
  ok(acct.status === 307 && (acct.headers.get("location") ?? "").includes("/login?next=/account"), "/account sends a visitor to sign in, and brings them back", `${acct.status} ${acct.headers.get("location")}`);
  const hp = await fetch(`${BASE}/g/${work.publicId}-${work.slug}`, { headers: { "user-agent": DESKTOP } });
  const wh = await hp.text();
  ok(hp.status === 200 && wh.includes("Comments") && wh.includes("Sign in to rate"), "a work page shows the comments and the rating prompt to a visitor who is not signed in");

  /* ───────────── sign-up ───────────── */
  console.log("\n— sign-up and the recovery codes");
  let ctx = await newCtx();
  let p = await ctx.newPage();
  await p.goto(`${BASE}/signup?next=${encodeURIComponent(`/g/${work.publicId}-${work.slug}`)}`, { waitUntil: "domcontentloaded" });
  const agreeBox = p.getByRole("checkbox").first();
  const submitSignup = () => p.getByRole("button", { name: "Create account" }).click();
  // the form refuses what the rules refuse
  await p.locator("#su-user").fill("ab");
  await p.locator("#su-pass").fill("short");
  await agreeBox.check();
  await submitSignup();
  ok(await waitText(p, /username of 3 to 20 characters|at least 8 characters/), "a too-short username or password is refused with a plain message");
  await p.locator("#su-user").fill("Admin");
  await p.locator("#su-pass").fill(PW);
  await submitSignup();
  ok(await waitText(p, /not available/), "a reserved username (Admin) is refused");
  await p.locator("#su-user").fill("zztest_loli");
  await submitSignup();
  ok(await waitText(p, /not available/), "a username with a flagged word is refused");
  await p.locator("#su-user").fill("zztestNew1");
  await agreeBox.uncheck();
  await submitSignup();
  ok(await waitText(p, /confirm that you are 18/), "sign-up needs the 18+ and rules box ticked");
  await agreeBox.check();
  await p.locator("#su-user").fill("zztestNew1");
  await p.locator("#su-pass").fill(PW);
  await p.getByRole("button", { name: "Create account" }).click();
  const codesShown = await p.getByRole("list", { name: "Recovery codes" }).waitFor({ timeout: 25000 }).then(() => true, () => false);
  ok(codesShown, "a new account is shown its recovery codes");
  const codes = codesShown ? await p.getByRole("list", { name: "Recovery codes" }).locator("li").allInnerTexts() : [];
  ok(codes.length === 8 && codes.every((c) => /^[a-z2-9]{4}-[a-z2-9]{4}$/.test(c)) && new Set(codes).size === 8, "eight different codes in the form abcd-efgh", codes.join(","));
  const cont = p.getByRole("button", { name: "Continue" });
  ok(await cont.isDisabled(), "Continue stays off until the codes are confirmed saved");
  const row = await retry(() => prisma.member.findUnique({ where: { handle: "zztestnew1" } }));
  ok(!!row && row.displayName === "zztestNew1" && row.passwordHash.startsWith("$2") && row.recoveryHashes.length === 8 && !row.passwordHash.includes(PW) && row.email === null, "stored: the lower-case handle, the name as typed, a bcrypt hash (never the password), eight hashed codes, no email");
  ok(!!row && !JSON.stringify(row.recoveryHashes).includes(codes[0] ?? "~"), "the codes are stored only as hashes");
  await p.getByRole("checkbox", { name: /saved these codes/i }).check();
  await cont.click();
  await p.waitForURL(/\/g\//, { timeout: 25000 }).catch(() => {});
  ok(p.url().includes(`/g/${work.publicId}`), "after sign-up the visitor returns to the page they came from", p.url());
  ok((await p.getByRole("link", { name: /Your account/ }).count()) === 1, "the header now shows the account button");
  const sess = await retry(() => prisma.memberSession.findFirst({ where: { member: { handle: "zztestnew1" } } }));
  const cookie = (await ctx.cookies()).find((c) => /lm_member/.test(c.name));
  ok(!!cookie && cookie.httpOnly && cookie.sameSite === "Lax" && !!sess && sess.tokenHash !== cookie.value && sess.tokenHash === createHash("sha256").update(cookie.value).digest("hex"), "the sign-in cookie is httpOnly, and only its hash is stored", JSON.stringify(cookie ?? {}).slice(0, 120));
  await p.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  ok(await waitText(p, /already signed in as/), "a signed-in member opening /signup is told so, not shown the form");
  // the same name again
  const ctxB = await newCtx();
  const pb = await ctxB.newPage();
  await pb.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  await pb.locator("#su-user").fill("ZZTESTNEW1");
  await pb.locator("#su-pass").fill(PW);
  await pb.getByRole("checkbox").first().check();
  await pb.getByRole("button", { name: "Create account" }).click();
  ok(await waitText(pb, /username is taken/), "a name that is taken (in any capitals) is refused");
  // a script that fills the trap field
  await pb.locator("#su-user").fill("zztestBot1");
  await pb.evaluate(() => { const i = document.querySelector('input[name="website"]') as HTMLInputElement; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(i, "http://spam.example"); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await pb.getByRole("button", { name: "Create account" }).click();
  await pb.waitForTimeout(1500);
  ok((await retry(() => prisma.member.count({ where: { handle: "zztestbot1" } }))) === 0, "a sign-up that fills the hidden trap field creates nothing");
  await ctxB.close();

  /* ───────────── sign-in and lock-out ───────────── */
  console.log("\n— sign-in");
  await p.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: "Sign out" }).click();
  await p.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
  ok((await ctx.cookies()).every((c) => !/lm_member/.test(c.name) || c.value === ""), "signing out removes the cookie");
  ok((await retry(() => prisma.memberSession.count({ where: { member: { handle: "zztestnew1" } } }))) === 0, "...and the session on the server");
  await signIn(p, "zztestNew1", "wrong-password-1");
  const wrong1 = await waitText(p, /wrong username or password/);
  await signIn(p, "zztestnobody", "wrong-password-1");
  const wrong2 = await waitText(p, /wrong username or password/);
  ok(wrong1 && wrong2, "a wrong password and an unknown username get the same answer");
  await signIn(p, "ZZTESTNEW1", PW, "/browse?sort=new");
  await p.waitForURL(/\/browse/, { timeout: 25000 }).catch(() => {});
  ok(p.url().includes("/browse?sort=new"), "signing in goes to the page asked for (and the name is not case sensitive)", p.url());
  await p.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: "Sign out" }).click();
  await p.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
  await signIn(p, "zztestNew1", PW, "https://evil.example/x");
  await p.waitForTimeout(500);
  const evil = new URL(p.url());
  ok(evil.origin === BASE, "an off-site ?next= is ignored");
  await ctx.close();

  // six wrong guesses lock the name for a while
  await seed("zztestLock");
  ctx = await newCtx();
  p = await ctx.newPage();
  for (let i = 0; i < 6; i++) {
    await signIn(p, "zztestLock", `wrong-guess-${i}`);
    await waitText(p, /wrong username or password|too many/);
  }
  await signIn(p, "zztestLock", PW);
  ok(await waitText(p, /too many attempts/), "after six wrong guesses even the right password is refused for a while");
  await ctx.close();

  /* ───────────── lost password ───────────── */
  console.log("\n— lost password");
  await seed("zztestLost", { recovery: ["abcd-2345", "wxyz-6789"] });
  ctx = await newCtx();
  p = await ctx.newPage();
  const reset = async (user: string, code: string, pw: string) => {
    await p.goto(`${BASE}/forgot`, { waitUntil: "domcontentloaded" });
    await p.locator("#rs-user").fill(user);
    await p.locator("#rs-code").fill(code);
    await p.locator("#rs-pass").fill(pw);
    await p.getByRole("button", { name: "Set new password" }).click();
  };
  await reset("zztestLost", "aaaa-bbbb", "NewPassw0rd!zz");
  ok(await waitText(p, /do not match/), "a wrong recovery code is refused");
  await reset("zztestLost", "ABCD 2345", "short");
  ok(await waitText(p, /at least 8/), "a weak new password is refused before the code is spent");
  ok((await retry(() => prisma.member.findUnique({ where: { handle: "zztestlost" }, select: { recoveryHashes: true } })))!.recoveryHashes.length === 2, "...and the code is still there");
  await reset("zztestLost", "ABCD 2345", "NewPassw0rd!zz");
  ok(await waitText(p, /password changed/), "a right code (capitals and a space do not matter) sets the new password");
  ok((await text(p)).includes("1 recovery code left"), "the page says how many codes are left");
  await reset("zztestLost", "abcd-2345", "AnotherPassw0rd!zz");
  ok(await waitText(p, /do not match/), "a used code cannot be used again");
  await ctx.close();
  ctx = await newCtx();
  p = await ctx.newPage();
  await signIn(p, "zztestLost", PW);
  ok(await waitText(p, /wrong username or password/), "the old password no longer works");
  await signIn(p, "zztestLost", "NewPassw0rd!zz");
  await p.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  ok(p.url() === `${BASE}/`, "the new password does");
  await ctx.close();

  /* ───────────── ratings ───────────── */
  console.log("\n— ratings");
  const A = await seed("zztestAlice");
  const B = await seed("zztestBob");
  const C = await seed("zztestCara");
  const D = await seed("zztestDan");
  const ctxA = await newCtx();
  const pa = await ctxA.newPage();
  await signIn(pa, "zztestAlice");
  await pa.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  await pa.goto(WORK_URL, { waitUntil: "domcontentloaded" });
  const stars = pa.getByRole("radiogroup", { name: "Your rating" });
  await stars.waitFor({ timeout: 20000 });
  await stars.getByRole("radio", { name: "4 stars" }).click();
  ok(await eventually(async () => { const w = await workNow(); return w!.ratingCount === startRating.count + 1 && w!.ratingSum === startRating.sum + 4; }), "a rating adds to the work's count and sum", JSON.stringify(await workNow()));
  await stars.getByRole("radio", { name: "2 stars" }).click();
  ok(await eventually(async () => { const w = await workNow(); return w!.ratingCount === startRating.count + 1 && w!.ratingSum === startRating.sum + 2; }), "changing it changes the sum, not the count", JSON.stringify(await workNow()));
  await stars.getByRole("radio", { name: "2 stars" }).click();
  ok(await eventually(async () => { const w = await workNow(); return w!.ratingCount === startRating.count && w!.ratingSum === startRating.sum; }), "tapping the same star again takes the rating back", JSON.stringify(await workNow()));
  await stars.getByRole("radio", { name: "5 stars" }).click();
  await eventually(async () => (await workNow())!.ratingCount === startRating.count + 1);
  await pa.reload({ waitUntil: "domcontentloaded" });
  ok(/5\.0<\/b>|5\.0/.test(await text(pa)) || /out of 5/.test(await text(pa)), "the average shows on the page");
  ok((await pa.getByRole("radio", { name: "5 stars" }).getAttribute("aria-checked")) === "true", "the member's own rating is remembered after a reload");
  // more than five or less than zero, straight to the action
  const bad = await retry(() => prisma.workRating.count({ where: { OR: [{ value: { gt: 5 } }, { value: { lt: 1 } }] } }));
  ok(bad === 0, "no stored rating is outside 1-5");
  await prisma.workRating.create({ data: { memberId: B.id, workId: work.id, value: 3 } });
  await prisma.work.update({ where: { id: work.id }, data: { ratingSum: { increment: 3 }, ratingCount: { increment: 1 } } });

  /* ───────────── comments ───────────── */
  console.log("\n— comments: the rules");
  const post = async (page: Page, body: string) => {
    const box = page.locator("#c-new");
    await box.fill(body);
    await page.getByRole("button", { name: "Post comment" }).click();
  };
  await pa.goto(WORK_URL, { waitUntil: "domcontentloaded" });
  await pa.locator("#c-new").waitFor({ timeout: 20000 });
  await post(pa, "zztest see https://spam.example now");
  ok(await waitText(pa, /links.*not allowed/), "a comment with a link is refused");
  await post(pa, "zztest this is about a loli story");
  ok(await waitText(pa, /does not allow/), "a comment that mentions a flagged word is refused, without repeating it");
  await post(pa, "zztest contact me on telegram: @someone");
  ok(await waitText(pa, /not allowed/), "contact details are refused");
  await pa.locator("#c-new").fill("x");
  ok(await pa.getByRole("button", { name: "Post comment" }).isDisabled(), "a one-letter comment cannot be sent (the button stays off)");
  const xss = 'zztest <img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> great art';
  await post(pa, xss);
  ok(await waitText(pa, /great art/), "a good comment is posted");
  const shown = await pa.getByText("great art").first().innerText();
  ok(shown.includes("<script>") && shown.includes("<img") && (await pa.evaluate(() => (window as unknown as { __xss?: number }).__xss)) === undefined, "markup in a comment is shown as text and never runs");
  const mineRow = await retry(() => prisma.comment.findFirst({ where: { workId: work.id, memberId: A.id }, orderBy: { createdAt: "desc" } }));
  ok(!!mineRow && mineRow.status === "VISIBLE" && mineRow.parentId === null, "it is stored as a visible top-level comment");
  await pa.locator("#c-new").fill(xss);
  await pa.getByRole("button", { name: "Post comment" }).click();
  ok(await waitText(pa, /wait \d+ second|already posted|posting very fast/), "a second comment straight away is held back (a pace for each account's age, and no repeats)");
  await ctxA.close();

  console.log("\n— comments: replies, votes, edit, delete");
  // Alice's top-level comment, made earlier in the run: the others answer it
  const top = mineRow!;
  const ctxBob = await newCtx();
  const pbb = await ctxBob.newPage();
  await signIn(pbb, "zztestBob");
  await pbb.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  await pbb.goto(WORK_URL, { waitUntil: "domcontentloaded" });
  const card = pbb.locator(`#comment-${top.id}`);
  await card.waitFor({ timeout: 20000 });
  const scoreIs = (n: number) => eventually(async () => (await retry(() => prisma.comment.findUnique({ where: { id: top.id }, select: { score: true } })))!.score === n);
  await card.getByRole("button", { name: "Up-vote" }).first().click();
  ok(await scoreIs(1), "an up-vote adds one to the score");
  await card.getByRole("button", { name: "Down-vote" }).first().click();
  ok(await scoreIs(-1), "switching to a down-vote moves it by two");
  await card.getByRole("button", { name: "Down-vote" }).first().click();
  ok(await scoreIs(0), "tapping it again takes the vote back");
  await card.getByRole("button", { name: "Reply" }).first().click();
  await card.locator("textarea").first().fill("zztest agreed, the art is lovely");
  await card.getByRole("button", { name: "Reply", exact: true }).last().click();
  ok(await waitText(pbb, /agreed, the art is lovely/), "a reply appears under the comment");
  const reply = await retry(() => prisma.comment.findFirst({ where: { workId: work.id, memberId: B.id, body: { startsWith: "zztest agreed" } } }));
  ok(!!reply && reply.parentId === top.id, "it is stored as a reply to that comment");
  // a reply to the reply hangs under the same top-level comment
  const ctxCara = await newCtx();
  const pc = await ctxCara.newPage();
  await signIn(pc, "zztestCara");
  await pc.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  await pc.goto(WORK_URL, { waitUntil: "domcontentloaded" });
  const replyCard = pc.locator(`#comment-${reply!.id}`);
  await replyCard.waitFor({ timeout: 20000 });
  await replyCard.getByRole("button", { name: "Reply" }).first().click();
  await replyCard.locator("textarea").first().fill("zztest me too");
  await replyCard.getByRole("button", { name: "Reply", exact: true }).last().click();
  await waitText(pc, /me too/);
  const deep = await retry(() => prisma.comment.findFirst({ where: { workId: work.id, memberId: C.id, body: "zztest me too" } }));
  ok(!!deep && deep.parentId === top.id, "a reply to a reply goes under the same top-level comment (one level deep)");
  // the author cannot vote on or report their own comment; others see Report
  const ctxA2 = await newCtx();
  const pa2 = await ctxA2.newPage();
  await signIn(pa2, "zztestAlice");
  await pa2.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  await pa2.goto(WORK_URL, { waitUntil: "domcontentloaded" });
  const mine = pa2.locator(`#comment-${top.id}`);
  await mine.waitFor({ timeout: 20000 });
  ok((await mine.getByRole("button", { name: "Up-vote" }).first().isDisabled()) && (await mine.getByRole("button", { name: "Down-vote" }).first().isDisabled()), "the author cannot vote on their own comment (the buttons are off)");
  // edit
  await mine.getByRole("button", { name: "Edit" }).first().click();
  await mine.locator("textarea").first().fill("zztest great art, edited");
  await mine.getByRole("button", { name: "Save" }).click();
  ok(await waitText(pa2, /great art, edited/) && (await text(pa2)).includes("(edited)"), "the author can edit a comment, and it says so");
  ok(!(await text(pa2)).includes("window.__xss"), "the old text is gone");
  // the same text cannot be a bad edit
  await mine.getByRole("button", { name: "Edit" }).first().click();
  await mine.locator("textarea").first().fill("zztest now see http://spam.example");
  await mine.getByRole("button", { name: "Save" }).click();
  ok(await waitText(pa2, /links.*not allowed/), "an edit is held to the same rules");
  await mine.getByRole("button", { name: "Cancel" }).first().click();
  // delete: a comment with replies stays as a placeholder
  pa2.once("dialog", (d) => d.accept());
  await mine.getByRole("button", { name: "Delete" }).first().click();
  ok(await waitText(pa2, /\[deleted\]/), "deleting a comment that has replies leaves \"[deleted]\" so the replies keep their place");
  ok((await text(pa2)).includes("agreed, the art is lovely"), "...and the replies are still there");
  const gone = await retry(() => prisma.comment.findUnique({ where: { id: top.id } }));
  ok(!!gone && gone.body === "" && gone.status === "REMOVED" && gone.memberId === null, "its text is gone from the database");
  await ctxA2.close();

  console.log("\n— reports and the automatic hide");
  const target = await prisma.comment.create({ data: { workId: work.id, memberId: D.id, body: "zztest report me" } });
  const reportFrom = async (handle: string, tgt: { id: string } = target, reason = "SPAM") => {
    const c = await newCtx();
    const pg = await c.newPage();
    await signIn(pg, handle);
    await pg.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
    await pg.goto(WORK_URL, { waitUntil: "domcontentloaded" });
    const el = pg.locator(`#comment-${tgt.id}`);
    await el.waitFor({ timeout: 20000 });
    await el.getByRole("button", { name: "Report" }).first().click();
    await el.getByRole("combobox").selectOption(reason);
    await el.getByRole("button", { name: "Send report" }).click();
    const sent = await waitText(pg, /a moderator will look at it/);
    await c.close();
    return sent;
  };
  ok(await reportFrom("zztestBob"), "a signed-in member can report a comment");
  ok((await retry(() => prisma.comment.findUnique({ where: { id: target.id }, select: { status: true } })))!.status === "VISIBLE", "one report does not hide it");
  ok(await reportFrom("zztestBob"), "reporting it again is accepted quietly");
  ok((await retry(() => prisma.commentReport.count({ where: { commentId: target.id } }))) === 1, "...but counts once");
  await reportFrom("zztestCara");
  await reportFrom("zztestAlice");
  ok((await retry(() => prisma.comment.findUnique({ where: { id: target.id }, select: { status: true } })))!.status === "HIDDEN", "three different members reporting hides it");
  const anon = await (await fetch(WORK_URL, { headers: { "user-agent": DESKTOP } })).text();
  ok(!anon.includes("zztest report me"), "a hidden comment is not in the page for visitors");
  // one mention of minors hides at once; reports from accounts under an hour old count for nothing
  const flagged = await prisma.comment.create({ data: { workId: work.id, memberId: D.id, body: "zztest minors flag" } });
  await reportFrom("zztestCara", flagged, "MINORS");
  ok(await eventually(async () => (await retry(() => prisma.comment.findUnique({ where: { id: flagged.id }, select: { status: true } })))!.status === "HIDDEN"), "a report that a comment mentions minors hides it at once (a moderator then decides)");
  await seed("zztestFresh", { ageDays: 0 });
  const unharmed = await prisma.comment.create({ data: { workId: work.id, memberId: D.id, body: "zztest fresh account reports" } });
  await reportFrom("zztestFresh", unharmed, "MINORS");
  ok((await retry(() => prisma.commentReport.count({ where: { commentId: unharmed.id } }))) === 1 && (await retry(() => prisma.comment.findUnique({ where: { id: unharmed.id }, select: { status: true } })))!.status === "VISIBLE", "a report from an account under an hour old is kept for the moderators but cannot hide a comment");
  const ctxD = await newCtx();
  const pd = await ctxD.newPage();
  await signIn(pd, "zztestDan");
  await pd.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  await pd.goto(WORK_URL, { waitUntil: "domcontentloaded" });
  ok(await waitText(pd, /zztest report me/) && (await text(pd)).includes("hidden pending review"), "its author still sees it, marked as hidden");
  await pd.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  ok((await text(pd)).includes("hidden pending review"), "and sees that on the account page too");

  /* ───────────── a ban ───────────── */
  console.log("\n— bans");
  await prisma.member.update({ where: { id: D.id }, data: { banned: true, bannedReason: "test ban", bannedAt: new Date() } });
  await pd.goto(WORK_URL, { waitUntil: "domcontentloaded" });
  ok(await waitText(pd, /cannot post comments/), "a banned member sees that they cannot post");
  const r = await pd.evaluate(async () => document.querySelector("#c-new") === null);
  ok(r, "there is no comment box for a banned member");
  await pd.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  ok((await text(pd)).includes("test ban"), "the account page gives the reason");
  await ctxD.close();

  /* ───────────── profile ───────────── */
  console.log("\n— profiles");
  const pubA = await fetch(`${BASE}/u/zztestAlice`, { headers: { "user-agent": DESKTOP } });
  const pubAHtml = await pubA.text();
  ok(pubA.status === 200 && /<meta name="robots" content="noindex/.test(pubAHtml), "a profile exists and is noindex");
  ok(!pubAHtml.includes("zztest@") && !/passwordHash|recovery/i.test(pubAHtml), "a profile shows no private fields");
  ok((await fetch(`${BASE}/u/zztestnobody`, { headers: { "user-agent": DESKTOP } })).status === 404, "an unknown profile is a 404");
  ok((await fetch(`${BASE}/u/a..b`, { headers: { "user-agent": DESKTOP } })).status === 404, "a malformed profile name is a 404");
  ok(!pubAHtml.includes("star") || !pubAHtml.includes("Ratings</h2>"), "ratings are not listed on a profile unless the member chose to");
  await prisma.member.update({ where: { id: A.id }, data: { showRatings: true } });
  const pubA2 = await (await fetch(`${BASE}/u/zztestAlice`, { headers: { "user-agent": DESKTOP } })).text();
  ok(pubA2.includes("Ratings") && pubA2.includes(work.slug.slice(0, 6)) || pubA2.includes("1 rating"), "with the box ticked the ratings are listed");
  const pubD = await (await fetch(`${BASE}/u/zztestDan`, { headers: { "user-agent": DESKTOP } })).text();
  ok(pubD.includes("suspended") && !pubD.includes("zztest report me"), "a banned member's profile says so and shows no comments");

  /* ───────────── account settings ───────────── */
  console.log("\n— account settings");
  const ctxE = await newCtx();
  const pe = await ctxE.newPage();
  await signIn(pe, "zztestCara");
  await pe.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  await pe.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  await pe.locator("#pf-name").fill("ZzTestCara");
  await pe.locator("#pf-bio").fill("I read a lot, visit example.com");
  await pe.getByRole("button", { name: "Save", exact: true }).click();
  ok(await waitText(pe, /links and contact details are not allowed/), "a bio with a link is refused");
  await pe.locator("#pf-bio").fill("I read a lot.");
  await pe.locator("#pf-name").fill("Somebody");
  await pe.getByRole("button", { name: "Save", exact: true }).click();
  ok(await waitText(pe, /can only change capital letters/), "the display name cannot become a different name");
  await pe.locator("#pf-name").fill("ZzTestCara");
  await pe.getByRole("button", { name: "Save", exact: true }).click();
  ok(await waitText(pe, /Saved\./), "profile changes are saved");
  const c2 = await retry(() => prisma.member.findUnique({ where: { id: C.id } }));
  ok(c2!.displayName === "ZzTestCara" && c2!.bio === "I read a lot." && c2!.handle === "zztestcara", "the display name changed its capitals, the handle did not");
  // password change signs the other devices out
  const ctxE2 = await newCtx();
  const pe2 = await ctxE2.newPage();
  await signIn(pe2, "zztestCara");
  await pe2.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  await pe.locator("#pw-cur").fill(PW);
  await pe.locator("#pw-new").fill("ChangedPassw0rd!zz");
  await pe.getByRole("button", { name: "Change password" }).click();
  ok(await waitText(pe, /password changed/), "a password change works with the current password");
  await pe2.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  ok(pe2.url().includes("/login"), "...and signs the member's other browsers out");
  await pe.reload({ waitUntil: "domcontentloaded" });
  ok(pe.url().endsWith("/account"), "...but not the one that changed it");
  // new recovery codes
  await pe.locator("#rc-pass").fill("not-the-password");
  await pe.getByRole("button", { name: "Make new codes" }).click();
  ok(await waitText(pe, /password is not right/), "new recovery codes need the password");
  await pe.locator("#rc-pass").fill("ChangedPassw0rd!zz");
  await pe.getByRole("button", { name: "Make new codes" }).click();
  ok(await pe.getByRole("list", { name: "Recovery codes" }).waitFor({ timeout: 20000 }).then(() => true, () => false), "with it, eight new codes are shown");
  ok((await retry(() => prisma.member.findUnique({ where: { id: C.id }, select: { recoveryHashes: true } })))!.recoveryHashes.length === 8, "they replace the old ones");
  await ctxE2.close();

  /* ───────────── delete account ───────────── */
  console.log("\n— deleting an account");
  const beforeDel = await retry(() => prisma.work.findUnique({ where: { id: work.id }, select: { ratingSum: true, ratingCount: true } }));
  await pe.getByRole("button", { name: "Done" }).click().catch(() => {});
  const bobRating = await retry(() => prisma.workRating.findUnique({ where: { memberId_workId: { memberId: B.id, workId: work.id } } }));
  await ctxBob.close();
  const ctxF = await newCtx();
  const pf = await ctxF.newPage();
  await signIn(pf, "zztestBob");
  await pf.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  await pf.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  await pf.locator("#del-pass").fill("wrong");
  await pf.getByRole("checkbox", { name: /delete my account for good/i }).check();
  await pf.getByRole("button", { name: "Delete my account" }).click();
  ok(await waitText(pf, /password is not right/), "deleting needs the password");
  await pf.locator("#del-pass").fill(PW);
  await pf.getByRole("button", { name: "Delete my account" }).click();
  await pf.waitForURL(`${BASE}/`, { timeout: 25000 }).catch(() => {});
  await pf.waitForTimeout(1500);
  ok(await eventually(async () => (await retry(() => prisma.member.count({ where: { handle: "zztestbob" } }))) === 0), "the account is gone");
  const afterDel = await workNow();
  ok(!!bobRating && afterDel!.ratingCount === beforeDel!.ratingCount - 1 && afterDel!.ratingSum === beforeDel!.ratingSum - bobRating.value, "its rating was taken back out of the work's average", JSON.stringify({ beforeDel, afterDel }));
  const bobReply = await retry(() => prisma.comment.findUnique({ where: { id: reply!.id } }));
  ok(!bobReply, "a comment without replies is deleted outright with the account");
  ok((await retry(() => prisma.commentReport.count({ where: { commentId: target.id } }))) >= 1, "reports on other comments survive");
  await ctxF.close();
  await ctxE.close();
  await ctxCara.close();

  /* ───────────── the console ───────────── */
  console.log("\n— console: moderation");
  const admin = await retry(() => prisma.adminUser.findFirst({ where: { active: true }, select: { id: true } }));
  if (!admin) {
    console.log("(no admin account to borrow: console checks skipped)");
  } else {
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const sess2 = await retry(() => prisma.adminSession.create({ data: { adminId: admin.id, tokenHash: hash, expiresAt: new Date(Date.now() + 30 * 60_000), userAgent: "zztest" } }));
    try {
      const cc = await newCtx();
      const host = new URL(BASE).hostname;
      await cc.addCookies([{ name: "__Host-lm_session", value: token, domain: host, path: "/", secure: true, httpOnly: true, sameSite: "Strict" }]);
      const pm = await cc.newPage();
      await pm.goto(`${BASE}/console/community`, { waitUntil: "domcontentloaded" });
      const inConsole = await waitText(pm, /Reported & hidden/, 25000);
      ok(inConsole, "the Community screen opens for an admin");
      if (inConsole) {
        ok(await waitText(pm, /zztest report me/), "a comment hidden by reports is in the queue, with its reports");
        ok((await text(pm)).includes("Spam") && /3 open reports/.test(await text(pm)), "the reasons and the number of open reports are shown");
        const art = pm.locator("article", { hasText: "zztest report me" });
        await art.getByRole("button", { name: "Restore" }).click();
        ok(await eventually(async () => (await retry(() => prisma.comment.findUnique({ where: { id: target.id }, select: { status: true } })))!.status === "VISIBLE"), "Restore puts the comment back");
        ok((await retry(() => prisma.commentReport.count({ where: { commentId: target.id, status: "OPEN" } }))) === 0, "...and closes its reports");
        ok((await retry(() => prisma.auditLog.count({ where: { action: "comment.restore", targetId: target.id } }))) === 1, "the decision is in the audit log");
        await pm.goto(`${BASE}/console/community?tab=members&q=zztest`, { waitUntil: "domcontentloaded" });
        ok(await waitText(pm, /zztestDan/), "members can be searched");
        ok((await text(pm)).includes("banned"), "a banned member is marked");
        await pm.goto(`${BASE}/console/community?tab=recent`, { waitUntil: "domcontentloaded" });
        const art2 = pm.locator("article", { hasText: "zztest report me" });
        await art2.waitFor({ timeout: 20000 });
        pm.once("dialog", (d) => d.accept());
        await art2.getByRole("button", { name: "Remove" }).click().catch(() => {});
        await pm.waitForTimeout(500);
        await pm.getByRole("button", { name: /^Remove$/ }).last().click().catch(() => {});
        ok(await eventually(async () => (await retry(() => prisma.comment.findUnique({ where: { id: target.id }, select: { status: true } })))!.status === "REMOVED"), "Remove takes the comment down");
        const t2 = await retry(() => prisma.comment.findUnique({ where: { id: target.id }, select: { status: true, body: true } }));
        ok(t2!.body === "zztest report me", "...but keeps its text for the record", JSON.stringify(t2));
      }
      await cc.close();
    } finally {
      await prisma.adminSession.delete({ where: { id: sess2.id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { action: { startsWith: "comment." }, targetId: target.id } }).catch(() => {});
    }
  }
} finally {
  await cleanup();
  const left = (await retry(() => prisma.member.count({ where: { handle: { startsWith: "zztest" } } }))) + (await retry(() => prisma.comment.count({ where: { body: { startsWith: "zztest" } } })));
  const w = await retry(() => prisma.work.findUnique({ where: { id: work.id }, select: { ratingSum: true, ratingCount: true } }));
  ok(left === 0 && w!.ratingSum === startRating.sum && w!.ratingCount === startRating.count, "the test data is gone and the work's rating is as it was", JSON.stringify({ left, w, startRating }));
  await browser.close();
  await prisma.$disconnect();
}
console.log(fails ? `\n${fails} FAILED` : "\nall member checks passed");
process.exit(fails ? 1 : 0);
