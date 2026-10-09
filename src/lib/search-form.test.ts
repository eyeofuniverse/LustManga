import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, emptyForm, formFromQuery, parseQuery } from "./search";

test("the form builds the search syntax", () => {
  assert.equal(buildQuery(emptyForm()), "");
  assert.equal(
    buildQuery({
      words: "  school   life ",
      include: [{ field: "tag", value: "big breasts" }, { field: "artist", value: "name" }],
      exclude: [{ field: "tag", value: "netorare" }],
      pagesMin: 20,
      pagesMax: 40,
      withinDays: 7,
    }),
    'school life tag:"big breasts" artist:name -tag:netorare pages:>=20 pages:<=40 uploaded:<7d',
  );
  assert.equal(buildQuery({ ...emptyForm(), pagesMin: 12, pagesMax: 12 }), "pages:12");
  assert.equal(buildQuery({ ...emptyForm(), pagesMin: 0, pagesMax: -3 }), "");
});

test("what the form builds is what the search page understands", () => {
  const q = buildQuery({ words: "school", include: [{ field: "parody", value: "fate grand order" }], exclude: [{ field: "tag", value: "x y" }], pagesMin: 10, withinDays: 30 });
  const p = parseQuery(q);
  assert.deepEqual(p.text, ["school"]);
  assert.deepEqual(p.terms, [{ neg: false, field: "parody", value: "fate grand order" }, { neg: true, field: "tag", value: "x y" }]);
  assert.deepEqual(p.pages, [{ op: ">=", n: 10 }]);
  assert.deepEqual(p.uploaded, [{ op: "<", n: 30 }]);
});

test("an existing query opens in the form, and building it again gives the same search", () => {
  const f = formFromQuery('big words tag:"big breasts" -tag:ntr pages:>20 pages:<=40 uploaded:<1y');
  assert.equal(f.words, "big words");
  assert.deepEqual(f.include, [{ field: "tag", value: "big breasts" }]);
  assert.deepEqual(f.exclude, [{ field: "tag", value: "ntr" }]);
  assert.equal(f.pagesMin, 21);
  assert.equal(f.pagesMax, 40);
  assert.equal(f.withinDays, 365);
  assert.deepEqual(parseQuery(buildQuery(f)).terms, parseQuery('tag:"big breasts" -tag:ntr').terms);
  assert.equal(formFromQuery("pages:15").pagesMin, 15);
  assert.equal(formFromQuery("pages:15").pagesMax, 15);
});
