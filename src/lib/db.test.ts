import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransientDbError, withPoolLimit } from "./db";

const URL = "postgresql://u:p@host.example:6543/postgres?pgbouncer=true";

test("a pool limit is added to the database URL: small on serverless, larger for jobs", () => {
  assert.equal(withPoolLimit(URL, { VERCEL: "1" }), `${URL}&connection_limit=3`);
  assert.equal(withPoolLimit(URL, {}), `${URL}&connection_limit=8`);
  assert.equal(withPoolLimit("postgresql://u:p@h/db", { VERCEL: "1" }), "postgresql://u:p@h/db?connection_limit=3", "a URL with no query string gets one");
});

test("a limit already in the URL, or DB_POOL, is respected; nonsense is clamped", () => {
  assert.equal(withPoolLimit(`${URL}&connection_limit=1`, { VERCEL: "1" }), `${URL}&connection_limit=1`);
  assert.equal(withPoolLimit(URL, { DB_POOL: "12" }), `${URL}&connection_limit=12`);
  assert.equal(withPoolLimit(URL, { DB_POOL: "9999" }), `${URL}&connection_limit=20`);
  assert.equal(withPoolLimit(URL, { DB_POOL: "0" }), `${URL}&connection_limit=8`, "0 is treated as unset");
  assert.equal(withPoolLimit(undefined, {}), undefined);
});

test("a full pooler is a temporary error to retry, not a failure", () => {
  for (const m of ["FATAL: (EMAXCONN) max client connections reached, limit: 200", "Error in connector: max client connections reached", "too many connections for role", "Can't reach database server", "ECONNRESET"]) {
    assert.equal(isTransientDbError(new Error(m)), true, m);
  }
  for (const m of ["Unique constraint failed on the fields: (`slug`)", "column does not exist", "syntax error at or near"]) {
    assert.equal(isTransientDbError(new Error(m)), false, m);
  }
});
