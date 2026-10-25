import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../service/src/db.ts";
import { removeDir } from "../remove-dir.ts";

const tables = ["tasks", "runs", "worktrees", "decisions", "budgets", "spends",
  "artifacts", "test_runs", "catalog_entries", "commands"];

test("openDb crea las diez tablas de producción en memoria", () => {
  const db = openDb(":memory:");
  try {
    const names = db.prepare("select name from sqlite_master where type = 'table'").all()
      .map(row => row.name);
    for (const table of tables) assert.ok(names.includes(table), `Falta ${table}`);
  } finally { db.close(); }
});

test("openDb permite reabrir el mismo archivo sin perder datos", () => {
  const dir = mkdtempSync(join(tmpdir(), "nomos-schema-"));
  try {
    const path = join(dir, "test.sqlite");
    const first = openDb(path);
    try { first.prepare(`insert into tasks(id, title, spec, acceptance, state, area,
      depends_on, created_at, updated_at) values(?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("task-1", "Tarea", "Spec", "[]", "pendiente", "qa", "[]", "now", "now");
    } finally { first.close(); }
    const second = openDb(path);
    try { assert.equal(second.prepare("select count(*) as n from tasks").get()?.n, 1); }
    finally { second.close(); }
  } finally { removeDir(dir); }
});

test("tasks.state rechaza estados fuera del contrato mediante CHECK", () => {
  const db = openDb(":memory:");
  try {
    assert.throws(() => db.prepare(`insert into tasks(id, title, spec, acceptance,
      state, area, depends_on, created_at, updated_at)
      values('bad', 'Tarea', '', '[]', 'bloqueada', 'qa', '[]', 'now', 'now')`).run(),
    /CHECK constraint failed/);
  } finally { db.close(); }
});

test("cada ámbito tiene un solo presupuesto y admite límites sin definir", () => {
  const db = openDb(":memory:");
  try {
    const insert = db.prepare(`insert into budgets(id, scope, scope_id, created_at, updated_at)
      values(?, 'workspace', 'demo', 'now', 'now')`);
    insert.run("budget-1");
    assert.equal(db.prepare("select tokens from budgets").get()?.tokens, null);
    assert.throws(() => insert.run("budget-2"), /UNIQUE constraint failed/);
  } finally { db.close(); }
});
