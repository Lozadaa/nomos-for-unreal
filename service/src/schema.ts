import type { DatabaseSync } from "node:sqlite";

/** Amplía el esquema del hito 0 sin modificar sus tablas ni contratos. */
export function applySchema(db: DatabaseSync): void {
  db.exec(`
    create table if not exists tasks(
      id text primary key, created_at text not null, updated_at text not null,
      title text not null, spec text not null, acceptance text not null,
      state text not null check(state in
        ('pendiente','preparada','implementando','revisando','probando','integrando','cerrando','done')),
      blocked_reason text, decision_id text,
      area text not null check(area in ('gameplay','ui','escenarios','assets','animacion','audio','qa','builds')),
      assignee_role text, assignee_provider text, parent_task_id text,
      depends_on text not null, worktree_id text, budget_id text);
    create table if not exists runs(
      id text primary key, created_at text not null, updated_at text not null,
      task_id text not null, role text not null,
      provider text not null check(provider in ('codex','claude','meshy','blender','unreal','kratos')),
      model text, session_ref text, attempt integer not null,
      state text not null check(state in ('running','done','failed','cancelled')),
      started_at text not null, finished_at text, summary text, skills text not null);
    create table if not exists worktrees(
      id text primary key, created_at text not null, updated_at text not null,
      task_id text not null, path text not null, branch text not null, base_commit text not null,
      state text not null check(state in ('active','closing','closed')), closed_reason text);
    create table if not exists decisions(
      id text primary key, created_at text not null, updated_at text not null,
      task_id text not null, reason text not null, evidence text not null, options text not null,
      chosen_option_id text, resolved_by text, resolved_at text, context_hash text not null,
      state text not null check(state in ('open','resolved','stale')));
    create table if not exists budgets(
      id text primary key, created_at text not null, updated_at text not null,
      scope text not null check(scope in ('workspace','task')), scope_id text not null,
      meshy_credits real, elevenlabs_credits real, tokens real, build_minutes real,
      unique(scope, scope_id));
    create table if not exists spends(
      id text primary key, created_at text not null, updated_at text not null,
      budget_id text not null, run_id text, kind text not null, amount real not null, note text);
    create table if not exists artifacts(
      id text primary key, created_at text not null, updated_at text not null,
      task_id text not null, run_id text,
      kind text not null check(kind in ('model','texture','screenshot','video','build','report','diff')),
      path text not null, preview_path text, provenance text not null, license text);
    create table if not exists test_runs(
      id text primary key, created_at text not null, updated_at text not null,
      task_id text not null, run_id text, "commit" text, engine_version text,
      map text, config text,
      result text not null check(result in ('pending','running','passed','failed','skipped','unavailable')),
      report_path text);
    create table if not exists catalog_entries(
      id text primary key, created_at text not null, updated_at text not null,
      name text not null, category text not null, description text not null,
      source text not null check(source in
        ('fab','megascans','polyhaven','ambientcg','kenney','quaternius','sketchfab','freesound','meshy','blender','engine')),
      source_url text, fab_uid text, entitlement_uid text,
      state text not null check(state in ('owned','downloaded','cached','imported')),
      projects text not null, formats text not null, engine_versions text not null,
      license text, ai_forbidden integer not null check(ai_forbidden in (0,1)),
      thumbnail_path text, local_path text, tags text not null);
    create table if not exists commands(
      id text primary key, created_at text not null, updated_at text not null,
      type text not null, payload text not null, idempotency_key text not null unique,
      state text not null check(state in ('pending','running','done','failed')),
      attempts integer not null, error text, claimed_by text, started_at text, finished_at text);
  `);
}
