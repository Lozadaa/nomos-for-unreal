import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

test("node trae sqlite y ejecuta ts", () => {
  const db = new DatabaseSync(":memory:");
  assert.equal(db.prepare("select 1 as uno").get()!.uno, 1);
  db.close();
});
