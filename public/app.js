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
  answered: false,
};

const els = {
  stageLabel: document.getElementById("stageLabel"),
  variantLabel: document.getElementById("variantLabel"),
  masteryLabel: document.getElementById("masteryLabel"),
  promptBlock: document.getElementById("promptBlock"),
  optionsGrid: document.getElementById("optionsGrid"),
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

async function loadStageLabel() {
  const res = await fetch("/api/stages");
  const stages = await res.json();
  const stage = stages.find((s) => s.id === state.stageId);
  if (stage) els.stageLabel.textContent = `Stage ${stage.stage_number}: ${stage.name}`;
}

function renderOptions(options) {
  els.optionsGrid.innerHTML = "";
  options.forEach((optionText) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    if (ARABIC_RE.test(optionText)) btn.classList.add("arabic");
    btn.textContent = optionText;
    btn.addEventListener("click", () => chooseOption(optionText, btn));
    els.optionsGrid.appendChild(btn);
  });
}

async function loadNextDrill() {
  state.answered = false;
  els.nextBtn.disabled = true;
  els.feedback.textContent = "";
  els.feedback.className = "feedback";
  els.optionsGrid.innerHTML = "";
  renderPrompt("Loading…");

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
  renderOptions(item.options);
}

async function chooseOption(selected, selectedBtn) {
  if (state.answered || !state.current) return;
  state.answered = true;

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
      userAnswer: selected,
      responseMs,
    }),
  });
  const result = await res.json();

  // Lock the grid, mark correct/incorrect on the buttons themselves —
  // no separate "check" step, the tap IS the answer.
  [...els.optionsGrid.children].forEach((btn) => {
    btn.disabled = true;
    if (btn.textContent === result.correct_answer) {
      btn.classList.add("correct");
    } else if (btn === selectedBtn) {
      btn.classList.add("incorrect");
    } else {
      btn.classList.add("dim");
    }
  });

  els.nextBtn.disabled = false;

  if (result.is_correct) {
    els.feedback.textContent = "Correct.";
    els.feedback.className = "feedback correct";
  } else {
    els.feedback.textContent = "Not quite — correct answer is highlighted.";
    els.feedback.className = "feedback incorrect";
  }
  els.masteryLabel.textContent = `Mastery: ${Math.round(result.mastery * 100)}%`;
}

els.nextBtn.addEventListener("click", loadNextDrill);
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !els.nextBtn.disabled) loadNextDrill();
});

loadStageLabel();
loadNextDrill();
