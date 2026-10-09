import { test } from "node:test";
import assert from "node:assert/strict";

import { remapHidden } from "./prefs";

test("a hidden tag that was merged into another is hidden under the survivor's id; live ones are left alone", () => {
  const slugOf = (n: string) => n.toLowerCase().replace(/\s+/g, "-");
  const hide = [{ id: 285, name: "Blow job" }, { id: 41, name: "netorare" }, { id: 999, name: "unknown tag" }];
  const out = remapHidden(hide, new Set([41, 92]), new Map([["blow-job", 92]]), slugOf);
  assert.deepEqual(out, [{ id: 92, name: "Blow job" }, { id: 41, name: "netorare" }, { id: 999, name: "unknown tag" }]);
});

test("hiding both spellings of one tag leaves it listed once", () => {
  const slugOf = (n: string) => n.toLowerCase().replace(/\s+/g, "-");
  const out = remapHidden([{ id: 92, name: "blowjob" }, { id: 285, name: "Blow job" }], new Set([92]), new Map([["blow-job", 92]]), slugOf);
  assert.deepEqual(out.map((h) => h.id), [92]);
});
