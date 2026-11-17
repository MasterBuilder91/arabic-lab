import type { DerivedWord, DrillItem, Pattern, Root } from "./types";

/**
 * THE MECHANISM (this is the whole point of "generative" drilling):
 *
 * Classical Arabic morphology is non-concatenative. A root like ك-ت-ب
 * ("writing") doesn't get a prefix/suffix glued on — it gets POURED into
 * a template (wazn) that already has its own fixed vowels and any extra
 * letters. The template is written using three placeholder letters:
 *
 *   ف (fā')   = slot for root letter 1
 *   ع ('ayn)  = slot for root letter 2
 *   ل (lām)   = slot for root letter 3
 *
 * Everything else in the template — vowels, extra consonants — is FIXED.
 * Example: the Form I active-participle template is فَاعِل (fā'-'ayn,
 * kasra, lām). Pour ك-ت-ب into it: ف→ك, ع→ت, ل→ب gives كَاتِب ("writer").
 * Pour د-ر-س ("studying") into the exact same template: دَارِس ("student/
 * studier"). Same rule, infinite roots. That's the generative drill —
 * not a flashcard deck, an algorithm the student internalizes.
 *
 * This file is that algorithm.
 */

const PLACEHOLDERS = ["ف", "ع", "ل"] as const;

/** Split a stored root "ك-ت-ب" into ["ك","ت","ب"]. */
export function splitRootLetters(letters: string): string[] {
  const parts = letters.split("-").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 3) {
    throw new Error(`Expected a triliteral root, got "${letters}"`);
  }
  return parts;
}

/**
 * Pour a root's letters into a pattern template.
 * Diacritics in the template are separate combining characters that
 * trail their base letter in the string — replacing the placeholder
 * letter itself leaves them exactly where they are.
 */
export function deriveSurfaceForm(rootLetters: string[], template: string): string {
  const [r1, r2, r3] = rootLetters;
  const map: Record<string, string> = {
    [PLACEHOLDERS[0]]: r1,
    [PLACEHOLDERS[1]]: r2,
    [PLACEHOLDERS[2]]: r3,
  };
  let out = "";
  for (const ch of template) {
    out += map[ch] ?? ch;
  }
  return out;
}

export type DrillVariant =
  | "produce_form"     // given root + wazn name -> produce the derived word
  | "identify_pattern" // given a derived word -> name the wazn
  | "identify_root";   // given a derived word -> extract the root

/**
 * Build one drill item. Checks for a stored override first (handles
 * irregular/weak/hollow/doubled roots and anything hand-vetted), falls
 * back to live algorithmic generation for regular sound roots.
 */
export function buildDrillItem(
  root: Root,
  pattern: Pattern,
  variant: DrillVariant,
  override?: DerivedWord | null
): DrillItem {
  const rootLetters = splitRootLetters(root.letters);
  const surfaceForm =
    override?.surface_form ?? deriveSurfaceForm(rootLetters, pattern.template);
  const generated = !override;

  let prompt: string;
  let correct_answer: string;

  switch (variant) {
    case "produce_form":
      prompt = `Root: ${root.letters_display}  (${root.gloss_en})\nPattern: ${pattern.wazn_label}\n\nProduce the derived word.`;
      correct_answer = surfaceForm;
      break;
    case "identify_pattern":
      prompt = `Word: ${surfaceForm}\nRoot: ${root.letters_display}\n\nWhich pattern (wazn) is this?`;
      correct_answer = pattern.wazn_label;
      break;
    case "identify_root":
      prompt = `Word: ${surfaceForm}\n\nWhat is the root?`;
      correct_answer = root.letters_display;
      break;
  }

  return {
    drill_type_key: variant,
    stage_id: pattern.stage_id,
    root_id: root.id,
    pattern_id: pattern.id,
    root_display: root.letters_display,
    root_gloss: root.gloss_en,
    pattern_label: pattern.wazn_label,
    pattern_description: pattern.description_en,
    prompt,
    correct_answer,
    generated,
  };
}

/**
 * Answer checking. Full tashkīl is required (no transliteration, no
 * diacritic-stripping shortcut) — that precision IS the i'raab skill
 * being drilled. Only cosmetic whitespace/tatweel differences are
 * normalized away.
 */
export function normalizeArabic(input: string): string {
  return input
    .replace(/ـ/g, "") // strip tatweel (ـ) — purely decorative elongation
    .replace(/\s+/g, " ")
    .trim();
}

export function checkAnswer(submitted: string, correct: string): boolean {
  return normalizeArabic(submitted) === normalizeArabic(correct);
}
