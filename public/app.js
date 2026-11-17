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
  lessonToggleBtn: document.getElementById("lessonToggleBtn"),
  lessonCard: document.getElementById("lessonCard"),
  lessonBody: document.getElementById("lessonBody"),
  startDrillingBtn: document.getElementById("startDrillingBtn"),
  drillCard: document.getElementById("drillCard"),
  variantLabel: document.getElementById("variantLabel"),
  masteryLabel: document.getElementById("masteryLabel"),
  promptBlock: document.getElementById("promptBlock"),
  optionsGrid: document.getElementById("optionsGrid"),
  nextBtn: document.getElementById("nextBtn"),
  feedback: document.getElementById("feedback"),
};

function renderInlineArabic(container, text) {
  // Splits a line on runs of Arabic vs. everything else so a mixed
  // "فَاعِل (faatih) — opener" line gets the Arabic part sized/RTL'd
  // without breaking the English around it.
  const parts = text.split(/([؀-ۿ][؀-ۿ\s]*)/).filter(Boolean);
  parts.forEach((part) => {
    if (ARABIC_RE.test(part)) {
      const span = document.createElement("span");
      span.className = "arabic-line";
      span.textContent = part;
      container.appendChild(span);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  });
}

function renderLesson(markdownLite) {
  els.lessonBody.innerHTML = "";
  if (!markdownLite) {
    els.lessonBody.textContent = "No lesson written for this stage yet.";
    return;
  }
  const blocks = markdownLite.split(/\n\n+/);
  blocks.forEach((block) => {
    const lines = block.split("\n").filter(Boolean);
    const isList = lines.every((l) => l.startsWith("- "));
    if (isList) {
      const ul = document.createElement("ul");
      lines.forEach((l) => {
        const li = document.createElement("li");
        renderInlineArabic(li, l.replace(/^- /, ""));
        ul.appendChild(li);
      });
      els.lessonBody.appendChild(ul);
    } else {
      const p = document.createElement("p");
      renderInlineArabic(p, block.replace(/\n/g, " "));
      els.lessonBody.appendChild(p);
    }
  });
}

function showLesson() {
  els.lessonCard.classList.remove("hidden");
  els.drillCard.classList.add("hidden");
}

function showDrill() {
  els.lessonCard.classList.add("hidden");
  els.drillCard.classList.remove("hidden");
}

let currentStage = null;

async function loadStage() {
  const res = await fetch("/api/stages");
  const stages = await res.json();
  currentStage = stages.find((s) => s.id === state.stageId) ?? null;
  if (currentStage) {
    els.stageLabel.textContent = `Stage ${currentStage.stage_number}: ${currentStage.name}`;
    renderLesson(currentStage.lesson_md);
  }
}

function renderPrompt(promptText) {
  els.promptBlock.innerHTML = "";
  promptText.split("\n").forEach((line) => {
    const el = document.createElement(ARABIC_RE.test(line) ? "span" : "div");
    if (ARABIC_RE.test(line)) el.classList.add("arabic");
    el.textContent = line;
    els.promptBlock.appendChild(el);
  });
}

function renderOptions(options) {
  els.optionsGrid.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    if (ARABIC_RE.test(opt.text)) btn.classList.add("arabic");
    btn.textContent = opt.text;
    btn.addEventListener("click", () => chooseOption(opt, btn));
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

async function chooseOption(selectedOption, selectedBtn) {
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
      userAnswer: selectedOption.text,
      responseMs,
    }),
  });
  const result = await res.json();

  const correctOption = state.current.options.find((o) => o.text === result.correct_answer);

  // Lock the grid, mark correct/incorrect on the buttons themselves —
  // no separate "check" step, the tap IS the answer.
  [...els.optionsGrid.children].forEach((btn, i) => {
    btn.disabled = true;
    const opt = state.current.options[i];
    if (opt.text === result.correct_answer) {
      btn.classList.add("correct");
    } else if (btn === selectedBtn) {
      btn.classList.add("incorrect");
    } else {
      btn.classList.add("dim");
    }
  });

  els.nextBtn.disabled = false;

  // Explain the mechanism, not just right/wrong.
  const explainBlock = document.createElement("div");
  explainBlock.className = "explain-block";

  if (!result.is_correct) {
    const wrongLine = document.createElement("div");
    wrongLine.className = "explain-line incorrect";
    wrongLine.innerHTML = `<span class="label">✗</span>${selectedOption.explanation}`;
    explainBlock.appendChild(wrongLine);
  }
  if (correctOption) {
    const correctLine = document.createElement("div");
    correctLine.className = "explain-line correct";
    correctLine.innerHTML = `<span class="label">✓</span>${correctOption.explanation}`;
    explainBlock.appendChild(correctLine);
  }

  els.feedback.innerHTML = "";
  els.feedback.className = result.is_correct ? "feedback correct" : "feedback incorrect";
  els.feedback.appendChild(explainBlock);

  els.masteryLabel.textContent = `Mastery: ${Math.round(result.mastery * 100)}%`;
}

els.nextBtn.addEventListener("click", loadNextDrill);
els.startDrillingBtn.addEventListener("click", () => {
  showDrill();
  loadNextDrill();
});
els.lessonToggleBtn.addEventListener("click", () => {
  const isHidden = els.lessonCard.classList.contains("hidden");
  if (isHidden) showLesson();
  else showDrill();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !els.nextBtn.disabled && !els.drillCard.classList.contains("hidden")) {
    loadNextDrill();
  }
});

loadStage().then(showLesson);
