import type { DrillVariant } from "./drillEngine";
import { buildDrillItem, checkAnswer, deriveSurfaceForm, perturbDiacritics, splitRootLetters } from "./drillEngine";
import {
  getDrillTypeByKey,
  getOtherPatternsForStage,
  getOverride,
  getRandomPatternForStage,
  getRandomRoot,
  getRandomRootsExcluding,
  getUserIdByClientUid,
  listStages,
  logAttempt,
  updateProgress,
} from "./db";
import type { Env } from "./types";

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/stages" && request.method === "GET") {
      const stages = await listStages(env);
      return json(stages);
    }

    if (url.pathname === "/api/drill/next" && request.method === "GET") {
      const stageId = Number(url.searchParams.get("stageId"));
      const variant = (url.searchParams.get("variant") ?? "produce_form") as DrillVariant;
      if (!stageId) return json({ error: "stageId is required" }, { status: 400 });

      const pattern = await getRandomPatternForStage(env, stageId);
      if (!pattern) return json({ error: "No patterns configured for this stage yet" }, { status: 404 });

      const root = await getRandomRoot(env);
      if (!root) return json({ error: "No roots seeded yet" }, { status: 404 });

      const override = await getOverride(env, root.id, pattern.id);

      // Build distractors appropriate to the variant — the whole point
      // is that the student taps a choice, never types an Arabic answer.
      let distractorCandidates: string[] = [];

      if (variant === "produce_form") {
        const rootLetters = splitRootLetters(root.letters);
        const correctForm = override?.surface_form ?? deriveSurfaceForm(rootLetters, pattern.template);

        const [otherPatterns, otherRoots] = await Promise.all([
          getOtherPatternsForStage(env, stageId, pattern.id, 1),
          getRandomRootsExcluding(env, root.id, 1),
        ]);

        if (otherPatterns[0]) {
          // right root, wrong pattern
          distractorCandidates.push(deriveSurfaceForm(rootLetters, otherPatterns[0].template));
        }
        if (otherRoots[0]) {
          // wrong root, right pattern
          distractorCandidates.push(deriveSurfaceForm(splitRootLetters(otherRoots[0].letters), pattern.template));
        }
        const perturbed = perturbDiacritics(correctForm);
        if (perturbed) distractorCandidates.push(perturbed); // right skeleton, wrong vowel
      } else if (variant === "identify_pattern") {
        const otherPatterns = await getOtherPatternsForStage(env, stageId, pattern.id, 3);
        distractorCandidates = otherPatterns.map((p) => p.wazn_label);
      } else if (variant === "identify_root") {
        const otherRoots = await getRandomRootsExcluding(env, root.id, 3);
        distractorCandidates = otherRoots.map((r) => r.letters_display);
      }

      const item = buildDrillItem(root, pattern, variant, override, distractorCandidates);
      return json(item);
    }

    if (url.pathname === "/api/drill/submit" && request.method === "POST") {
      const body = await request.json<{
        clientUid: string;
        drillTypeKey: string;
        stageId: number | null;
        rootId: number;
        patternId: number;
        prompt: string;
        correctAnswer: string;
        userAnswer: string;
        responseMs?: number;
      }>();

      const userId = await getUserIdByClientUid(env, body.clientUid);
      const drillType = await getDrillTypeByKey(env, body.drillTypeKey);
      if (!drillType) return json({ error: `Unknown drill type "${body.drillTypeKey}"` }, { status: 400 });

      const isCorrect = checkAnswer(body.userAnswer, body.correctAnswer);

      await logAttempt(env, {
        userId,
        drillTypeId: drillType.id,
        stageId: body.stageId,
        rootId: body.rootId,
        patternId: body.patternId,
        prompt: body.prompt,
        correctAnswer: body.correctAnswer,
        userAnswer: body.userAnswer,
        isCorrect,
        responseMs: body.responseMs ?? null,
      });

      const mastery = body.stageId
        ? await updateProgress(env, userId, body.stageId, isCorrect)
        : 0;

      return json({ is_correct: isCorrect, correct_answer: body.correctAnswer, mastery });
    }

    // Everything else: serve the static frontend.
    return env.ASSETS.fetch(request);
  },
};
