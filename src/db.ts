import type { DerivedWord, DrillType, Env, Pattern, Root, Stage } from "./types";

export async function listStages(env: Env): Promise<Stage[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM stages ORDER BY stage_number ASC"
  ).all<Stage>();
  return results;
}

export async function getUserIdByClientUid(env: Env, clientUid: string): Promise<number> {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE client_uid = ?")
    .bind(clientUid)
    .first<{ id: number }>();
  if (existing) return existing.id;

  const inserted = await env.DB.prepare(
    "INSERT INTO users (client_uid) VALUES (?) RETURNING id"
  )
    .bind(clientUid)
    .first<{ id: number }>();
  if (!inserted) throw new Error("Failed to create user");
  return inserted.id;
}

export async function getDrillTypeByKey(env: Env, key: string): Promise<DrillType | null> {
  return env.DB.prepare("SELECT * FROM drill_types WHERE key = ?").bind(key).first<DrillType>();
}

/** Random root, optionally restricted to a stage's frequency tier or lower. */
export async function getRandomRoot(env: Env, maxFrequencyTier?: number): Promise<Root | null> {
  const stmt = maxFrequencyTier
    ? env.DB.prepare(
        "SELECT * FROM roots WHERE frequency_tier <= ? ORDER BY RANDOM() LIMIT 1"
      ).bind(maxFrequencyTier)
    : env.DB.prepare("SELECT * FROM roots ORDER BY RANDOM() LIMIT 1");
  return stmt.first<Root>();
}

export async function getRandomPatternForStage(env: Env, stageId: number): Promise<Pattern | null> {
  return env.DB.prepare(
    "SELECT * FROM patterns WHERE stage_id = ? ORDER BY RANDOM() LIMIT 1"
  )
    .bind(stageId)
    .first<Pattern>();
}

/** Other patterns in the same stage (for "wrong pattern" distractors). */
export async function getOtherPatternsForStage(
  env: Env,
  stageId: number,
  excludePatternId: number,
  limit = 3
): Promise<Pattern[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM patterns WHERE stage_id = ? AND id != ? ORDER BY RANDOM() LIMIT ?"
  )
    .bind(stageId, excludePatternId, limit)
    .all<Pattern>();
  return results;
}

/** Other random roots (for "wrong root" distractors). */
export async function getRandomRootsExcluding(
  env: Env,
  excludeRootId: number,
  limit = 3
): Promise<Root[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM roots WHERE id != ? ORDER BY RANDOM() LIMIT ?"
  )
    .bind(excludeRootId, limit)
    .all<Root>();
  return results;
}

export async function getOverride(
  env: Env,
  rootId: number,
  patternId: number
): Promise<DerivedWord | null> {
  return env.DB.prepare(
    "SELECT * FROM derived_words WHERE root_id = ? AND pattern_id = ?"
  )
    .bind(rootId, patternId)
    .first<DerivedWord>();
}

export async function logAttempt(
  env: Env,
  args: {
    userId: number;
    drillTypeId: number;
    stageId: number | null;
    rootId: number;
    patternId: number;
    prompt: string;
    correctAnswer: string;
    userAnswer: string;
    isCorrect: boolean;
    responseMs: number | null;
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO attempts
      (user_id, drill_type_id, stage_id, root_id, pattern_id, prompt, correct_answer, user_answer, is_correct, response_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      args.userId,
      args.drillTypeId,
      args.stageId,
      args.rootId,
      args.patternId,
      args.prompt,
      args.correctAnswer,
      args.userAnswer,
      args.isCorrect ? 1 : 0,
      args.responseMs
    )
    .run();
}

/** Rolling mastery update: simple exponential-moving-average toward 0/1. */
export async function updateProgress(
  env: Env,
  userId: number,
  stageId: number,
  isCorrect: boolean,
  alpha = 0.2
): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT mastery, attempts_count FROM progress WHERE user_id = ? AND stage_id = ?"
  )
    .bind(userId, stageId)
    .first<{ mastery: number; attempts_count: number }>();

  const prevMastery = row?.mastery ?? 0;
  const nextMastery = prevMastery + alpha * ((isCorrect ? 1 : 0) - prevMastery);
  const nextCount = (row?.attempts_count ?? 0) + 1;

  await env.DB.prepare(
    `INSERT INTO progress (user_id, stage_id, mastery, attempts_count, last_practiced_at, unlocked)
     VALUES (?, ?, ?, ?, datetime('now'), 1)
     ON CONFLICT(user_id, stage_id) DO UPDATE SET
       mastery = excluded.mastery,
       attempts_count = excluded.attempts_count,
       last_practiced_at = excluded.last_practiced_at`
  )
    .bind(userId, stageId, nextMastery, nextCount)
    .run();

  return nextMastery;
}
