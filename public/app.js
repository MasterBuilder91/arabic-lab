const DIACRITICS = [
  { ch: "َ", label: "َ" }, // fatha
  { ch: "ِ", label: "ِ" }, // kasra
  { ch: "ُ", label: "ُ" }, // damma
  { ch: "ْ", label: "ْ" }, // sukun
  { ch: "ّ", label: "ّ" }, // shadda
  { ch: "ً", label: "ً" }, // fathatan
  { ch: "ٍ", label: "ٍ" }, // kasratan
  { ch: "ٌ", label: "ٌ" }, // dammatan
  { ch: "آ", label: "آ" },
  { ch: "أ", label: "أ" },
  { ch: "إ", label: "إ" },
  { ch: "ة", label: "ة" },
];

const ARABIC_RE = /[؀-ۿ]/;

function getClientUid() {
  let uid = localStorage.getItem("arabiclab_uid");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("arabiclab_uid", uid);
  }
  return uid;
}

const state = {
  clientUid: getClientUid(),
  stageId: 1,
  variants: ["produce_form", "identify_pattern", "identify_root"],
  current: null,
  startedAt: 0,
};

const els = {
  stageLabel: document.getElementById("stageLabel"),
  variantLabel: document.getElementById("variantLabel"),
  masteryLabel: document.getElementById("masteryLabel"),
  promptBlock: document.getElementById("promptBlock"),
  answerInput: document.getElementById("answerInput"),
  diacriticBar: document.getElementById("diacriticBar"),
  submitBtn: document.getElementById("submitBtn"),
  nextBtn: document.getElementById("nextBtn"),
  feedback: document.getElementById("feedback"),
};

function renderPrompt(promptText) {
  els.promptBlock.innerHTML = "";
  promptText.split("\n").forEach((line) => {
    const el = document.createElement(ARABIC_RE.test(line) ? "span" : "div");
    if (ARABIC_RE.test(line)) el.classList.add("arabic");
    el.textContent = line;
    els.promptBlock.appendChild(el);
  });
}

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
  input.focus();
}

function buildDiacriticBar() {
  els.diacriticBar.innerHTML = "";
  DIACRITICS.forEach((d) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = d.label;
    btn.addEventListener("click", () => insertAtCursor(els.answerInput, d.ch));
    els.diacriticBar.appendChild(btn);
  });
}

async function loadStageLabel() {
  const res = await fetch("/api/stages");
  const stages = await res.json();
  const stage = stages.find((s) => s.id === state.stageId);
  if (stage) els.stageLabel.textContent = `Stage ${stage.stage_number}: ${stage.name}`;
}

async function loadNextDrill() {
  els.submitBtn.disabled = false;
  els.nextBtn.disabled = true;
  els.answerInput.value = "";
  els.answerInput.disabled = false;
  els.feedback.textContent = "";
  els.feedback.className = "feedback";

  const variant = state.variants[Math.floor(Math.random() * state.variants.length)];
  const res = await fetch(`/api/drill/next?stageId=${state.stageId}&variant=${variant}`);
  if (!res.ok) {
    renderPrompt("No drill available yet for this stage.");
    return;
  }
  const item = await res.json();
  state.current = item;
  state.startedAt = performance.now();

  els.variantLabel.textContent = variant.replace(/_/g, " ");
  renderPrompt(item.prompt);
  els.answerInput.focus();
}

async function submitAnswer() {
  if (!state.current) return;
  const userAnswer = els.answerInput.value;
  const responseMs = Math.round(performance.now() - state.startedAt);

  const res = await fetch("/api/drill/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientUid: state.clientUid,
      drillTypeKey: state.current.drill_type_key,
      stageId: state.current.stage_id,
      rootId: state.current.root_id,
      patternId: state.current.pattern_id,
      prompt: state.current.prompt,
      correctAnswer: state.current.correct_answer,
      userAnswer,
      responseMs,
    }),
  });
  const result = await res.json();

  els.submitBtn.disabled = true;
  els.nextBtn.disabled = false;
  els.answerInput.disabled = true;

  if (result.is_correct) {
    els.feedback.textContent = "Correct.";
    els.feedback.className = "feedback correct";
  } else {
    els.feedback.textContent = `Not quite. Correct answer: ${result.correct_answer}`;
    els.feedback.className = "feedback incorrect";
  }
  els.masteryLabel.textContent = `Mastery: ${Math.round(result.mastery * 100)}%`;
}

els.submitBtn.addEventListener("click", submitAnswer);
els.nextBtn.addEventListener("click", loadNextDrill);
els.answerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (!els.submitBtn.disabled) submitAnswer();
    else if (!els.nextBtn.disabled) loadNextDrill();
  }
});

buildDiacriticBar();
loadStageLabel();
loadNextDrill();
