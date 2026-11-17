export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export interface Stage {
  id: number;
  stage_number: number;
  name: string;
  name_ar: string | null;
  description: string | null;
  pt_rationale: string | null;
  prerequisite_stage_id: number | null;
}

export interface Root {
  id: number;
  letters: string;          // unvoweled, hyphenated: e.g. "ك-ت-ب"
  letters_display: string;  // display form: e.g. "ك ت ب"
  gloss_en: string;
  frequency_tier: number | null;
  notes: string | null;
}

export interface Pattern {
  id: number;
  category: string;     // 'verb_form' | 'active_participle' | 'passive_participle' | 'masdar' | 'noun_pattern' | ...
  wazn_label: string;    // e.g. "Form I", "فَاعِل"
  template: string;      // template string using placeholders ف ع ل for root letters 1,2,3
  description_en: string | null;
  stage_id: number | null;
}

export interface DerivedWord {
  id: number;
  root_id: number;
  pattern_id: number;
  surface_form: string;
  gloss_en: string;
  irregular: number; // 0 | 1
  notes: string | null;
}

export interface DrillType {
  id: number;
  key: string;    // 'root_pattern_derivation' | 'identify_pattern' | 'identify_root' | ...
  label: string;
  mode: 'generative' | 'closed_set';
  stage_id: number | null;
}

export interface DrillItem {
  drill_type_key: string;
  stage_id: number | null;
  root_id: number;
  pattern_id: number;
  root_display: string;
  root_gloss: string;
  pattern_label: string;
  pattern_description: string | null;
  prompt: string;       // what's shown to the student
  correct_answer: string;
  options: string[];    // tappable choices, shuffled, correct_answer always included
  generated: boolean;   // true if algorithmically derived (no stored override), false if looked up
}

export interface SubmitResult {
  is_correct: boolean;
  correct_answer: string;
  mastery: number;
}
