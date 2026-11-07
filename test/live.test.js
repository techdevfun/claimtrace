/** Live smoke tests against the real registries (soft-skip when offline). */
import test from "node:test";
import assert from "node:assert/strict";

async function headStatus(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    return res.status;
  } finally {
    clearTimeout(timer);
  }
}

test("live: npm package name `claimtrace` is still free (404)", async (t) => {
  let status;
  try {
    status = await headStatus("https://registry.npmjs.org/claimtrace");
  } catch {
    t.skip("offline — npm registry unreachable");
    return;
  }
  assert.equal(status, 404);
});

test("live: GitHub repo techdevfun/claimtrace does not exist yet (404)", async (t) => {
  let status;
  try {
    status = await headStatus("https://api.github.com/repos/techdevfun/claimtrace");
  } catch {
    t.skip("offline — api.github.com unreachable");
    return;
  }
  assert.equal(status, 404);
});
