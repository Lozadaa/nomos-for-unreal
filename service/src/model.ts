type Entity = { id: string; createdAt: string; updatedAt: string };
export type TaskState = 'pendiente' | 'preparada' | 'implementando' | 'revisando'
  | 'probando' | 'integrando' | 'cerrando' | 'done';
export type TaskArea = 'gameplay' | 'ui' | 'escenarios' | 'assets' | 'animacion' | 'audio' | 'qa' | 'builds';
export type Provider = 'codex' | 'claude' | 'opencode' | 'meshy' | 'blender' | 'unreal' | 'kratos';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type Task = Entity & {
  title: string; spec: string; acceptance: string[]; state: TaskState;
  blockedReason: string | null; decisionId: string | null; area: TaskArea;
  assigneeRole: string | null; assigneeProvider: string | null; parentTaskId: string | null;
  dependsOn: string[]; worktreeId: string | null; budgetId: string | null; scope: string[];
  leases: string[]; reviewApproved: 0 | 1; waitReason: string | null;
  attribution: Attribution; archivePath: string | null;
};
/** Quién hizo qué en la tarea (hito 6): implemento, reviso, genero, integro, verifico. */
export type Attribution = Record<string, {runId: string; provider: string; agentName: string; at: string}[]>;
export type RunMetadata = {
  worktreeId?: string; cursor?: string; waiting?: boolean; question?: string;
  phase?: 'preparing' | 'running' | 'waiting' | 'finished'; deadlineAt?: string;
  lastOutputAt?: string; correctionCount?: number; pollGeneration?: number;
  lastLines?: string[]; markerBuffer?: string; markerFence?: string; idlePolls?: number;
  uncertain?: boolean;
  startCommandId?: string;
  review?: import('./review.ts').ReviewSnapshot;
  implementationGeneration?: number;
  screenFingerprint?: string; seenDoneMarkers?: string[]; legacyDoneSummaries?: string[];
  confirmedSkills?: string[]; seenAskMarkers?: string[];
  /** Modelo Claude con el que arrancó (workerModel); el relevo de terminal lo repite. */
  /** `sonnet`… para Claude; `opencode/…` para OpenCode (hito 12). */ model?: string;
  // trabajo de assets (hito 4): orden que lo creó y, en Meshy, el job remoto
  commandId?: string; remoteId?: string; kind?: string; stage?: string; idempotencyKey?: string;
  prompt?: string; params?: JsonValue; budgetId?: string; estimatedCredits?: number; entryId?: string;
  // pruebas (hito 5): run implementador cuyo diff se prueba
  implementerRunId?: string; qa?: {testRunId: string}; checks?: string[]; checksCommit?: string | null;
  // integración (hito 6): merge hecho en el workspace y pendiente de publicar
  integration?: {base: string; commit: string; files: string[]; checked?: boolean};
  // hito 5b: contenido pesado al integrar (Decisión de Git LFS)
  lfs?: 'sin' | 'configurando' | 'listo';
  continuationOf?: string; busyAttempts?: number;
};
export type Run = Entity & {
  taskId: string; role: string; provider: Provider; model: string | null;
  sessionRef: string | null; attempt: number; state: 'running' | 'done' | 'failed' | 'cancelled';
  startedAt: string; finishedAt: string | null; summary: string | null; skills: string[]; metadata: RunMetadata;
};
export type Worktree = Entity & {
  taskId: string; path: string; branch: string; baseCommit: string;
  state: 'active' | 'closing' | 'closed'; closedReason: string | null;
};
export type Decision = Entity & {
  taskId: string; reason: string; evidence: { kind: string; ref: string }[];
  options: { id: string; label: string; description: string; recommended?: boolean; thumbnail?: string }[];
  chosenOptionId: string | null; resolvedBy: string | null; resolvedAt: string | null;
  contextHash: string; state: 'open' | 'resolved' | 'stale';
};
export type Budget = Entity & {
  scope: 'workspace' | 'task'; scopeId: string; meshyCredits: number | null;
  elevenlabsCredits: number | null; tokens: number | null; buildMinutes: number | null;
};
export type Spend = Entity & {
  budgetId: string; runId: string | null; kind: string; amount: number; note: string | null;
};
export type Artifact = Entity & {
  taskId: string; runId: string | null;
  kind: 'model' | 'texture' | 'screenshot' | 'video' | 'build' | 'report' | 'diff';
  path: string; previewPath: string | null; provenance: JsonValue; license: string | null;
};
export type TestRun = Entity & {
  taskId: string; runId: string | null; commit: string | null; engineVersion: string | null;
  map: string | null; config: string | null;
  result: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'unavailable';
  reportPath: string | null; checkId: string | null;
};
export type CatalogEntry = Entity & {
  name: string; category: string; description: string;
  source: 'fab' | 'megascans' | 'polyhaven' | 'ambientcg' | 'kenney' | 'quaternius'
    | 'sketchfab' | 'freesound' | 'meshy' | 'blender' | 'engine';
  sourceUrl: string | null; fabUid: string | null; entitlementUid: string | null;
  state: 'owned' | 'downloaded' | 'cached' | 'imported'; projects: string[];
  formats: string[]; engineVersions: string[]; license: string | null; aiForbidden: 0 | 1;
  thumbnailPath: string | null; localPath: string | null; tags: string[]; verifiedEngine?: string | null;
};
export type Command = Entity & {
  type: string; payload: JsonValue; idempotencyKey: string;
  state: 'pending' | 'running' | 'done' | 'failed'; attempts: number;
  error: string | null; claimedBy: string | null; startedAt: string | null; finishedAt: string | null; notBefore: string | null;
  lane?: 'normal' | 'long'; heartbeatAt?: string | null;
};
