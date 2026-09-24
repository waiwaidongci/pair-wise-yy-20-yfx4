// 页面操作模块：负责渲染、播放与用户交互；拍号推演交给 Meter，方案版本与存取交给 PlanStore。
const { instruments } = PlanStore;
const state = PlanStore.load();

let timer = null;
let playhead = 0;
let audioContext = null;
let messageTimer = null;

const grid = document.querySelector("#grid");
const savedList = document.querySelector("#savedList");
const structure = document.querySelector("#structure");
const notesList = document.querySelector("#notesList");
const pieceName = document.querySelector("#pieceName");
const bpmInput = document.querySelector("#bpmInput");
const loopSelect = document.querySelector("#loopSelect");
const noteInput = document.querySelector("#noteInput");
const messageBox = document.querySelector("#message");

function persist() {
  PlanStore.save(state);
}

function syncFields() {
  pieceName.value = state.pieceName;
  bpmInput.value = state.bpm;
  loopSelect.value = state.loop;
}

function showMessage(text, type = "info") {
  messageBox.textContent = text;
  messageBox.className = `message ${type} show`;
  clearTimeout(messageTimer);
  if (text) {
    messageTimer = setTimeout(() => {
      messageBox.className = "message";
    }, 4000);
  }
}

// 网格按各小节实际拍数列宽，并在小节交界处加粗小节线。
function gridColumns() {
  const widths = state.meters.map((beats) => `repeat(${beats}, minmax(48px, 1fr))`).join(" ");
  return `76px ${widths}`;
}

function renderGrid() {
  const cells = [];
  const bounds = Meter.starts(state.meters);
  const barAt = new Set(bounds.slice(1));

  // 第一行：乐器表头 + 每小节一个拍号选择。
  cells.push('<div class="label-cell">拍号</div>');
  state.meters.forEach((beats, measure) => {
    const options = Meter.OPTIONS.map(
      (value) => `<option value="${value}" ${value === beats ? "selected" : ""}>${value}/4</option>`
    ).join("");
    cells.push(
      `<div class="meter-cell ${measure > 0 ? "barline" : ""}" style="grid-column: span ${beats};">
        <label class="meter-pick">第${measure + 1}小节
          <select data-meter="${measure}" aria-label="第${measure + 1}小节拍号">${options}</select>
        </label>
      </div>`
    );
  });

  // 第二行：乐器列标题 + 按实际拍数生成的拍位标签。
  cells.push('<div class="label-cell">乐器</div>');
  const total = Meter.totalBeats(state.meters);
  for (let step = 0; step < total; step += 1) {
    cells.push(`<div class="beat-cell ${barAt.has(step) ? "barline" : ""}">${Meter.beatLabel(state.meters, step)}</div>`);
  }

  // 数据行。
  instruments.forEach((instrument, rowIndex) => {
    cells.push(`<div class="label-cell">${instrument.name}</div>`);
    for (let step = 0; step < total; step += 1) {
      const value = state.pattern[rowIndex][step];
      cells.push(
        `<button class="cell ${value ? "filled" : ""} ${barAt.has(step) ? "barline" : ""}" type="button" data-row="${rowIndex}" data-step="${step}">${value}</button>`
      );
    }
  });

  grid.style.gridTemplateColumns = gridColumns();
  grid.innerHTML = cells.join("");
}

// 段落统计：按各小节实际拍数切片计数。
function renderStructure() {
  structure.innerHTML = state.meters
    .map((beats, measure) => {
      const [start, end] = Meter.range(state.meters, measure);
      const count = state.pattern
        .flatMap((row) => row.slice(start, end + 1))
        .filter(Boolean).length;
      return `
        <div class="structure-row">
          <span>第${measure + 1}小节（${beats}拍）</span>
          <strong>${count}个口令</strong>
        </div>`;
    })
    .join("");
}

function renderNotes() {
  notesList.innerHTML = state.notes.length ? state.notes.map((note) => `
    <article class="note"><p>${note}</p></article>
  `).join("") : "<p>暂无批注。</p>";
}

function meterSummary() {
  return state.meters.map((beats) => `${beats}`).join("-");
}

function renderSaved() {
  savedList.innerHTML = state.saved.length ? state.saved.map((item) => `
    <button class="saved-item" type="button" data-load="${item.id}">
      <strong>${item.name}</strong><br>
      <span>${item.bpm}BPM · 拍号${(item.meters || []).map((b) => b).join("-") || "4-4-4-4"} · ${item.notes.length}条批注</span>
    </button>
  `).join("") : "<p>还没有保存方案。</p>";
}

function renderLoopOptions() {
  loopSelect.innerHTML = [
    '<option value="">全段</option>',
    ...state.meters.map((beats, measure) =>
      `<option value="${measure}">第${measure + 1}小节（${beats}拍）</option>`
    )
  ].join("");
  // 选中项在小节数变化后可能失效，退回全段。
  if (state.loop !== "" && Number(state.loop) >= state.meters.length) {
    state.loop = "";
    persist();
  }
  loopSelect.value = state.loop;
}

function render() {
  renderLoopOptions();
  syncFields();
  renderGrid();
  renderStructure();
  renderNotes();
  renderSaved();
}

function playSound(instrument) {
  audioContext ||= new AudioContext();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.frequency.value = instrument.freq;
  osc.type = instrument.name === "鼓" ? "sine" : "square";
  gain.gain.setValueAtTime(0.08, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
  osc.connect(gain).connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + 0.09);
}

function highlight(step) {
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));
  document.querySelectorAll(`[data-step="${step}"]`).forEach((cell) => cell.classList.add("playing"));
}

// 循环范围按所选小节的实际拍数，全段则覆盖所有实际拍位。
function currentRange() {
  if (state.loop === "") return [0, Meter.totalBeats(state.meters) - 1];
  return Meter.range(state.meters, Number(state.loop));
}

function tick() {
  const [start, end] = currentRange();
  if (playhead < start || playhead > end) playhead = start;
  highlight(playhead);
  instruments.forEach((instrument, rowIndex) => {
    if (state.pattern[rowIndex][playhead]) playSound(instrument);
  });
  playhead = playhead >= end ? start : playhead + 1;
}

grid.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const row = Number(cell.dataset.row);
  const step = Number(cell.dataset.step);
  state.pattern[row][step] = state.pattern[row][step] ? "" : instruments[row].token;
  persist();
  render();
});

// 拍号修改：让拍号模块先推演，装不下时整体回退并提示搬不动的口令与原拍位。
grid.addEventListener("change", (event) => {
  const picker = event.target.closest("[data-meter]");
  if (!picker) return;
  const measure = Number(picker.dataset.meter);
  const next = Number(picker.value);
  const result = Meter.changeMeter(state.pattern, state.meters, measure, next);

  if (!result.ok) {
    picker.value = String(state.meters[measure]);
    showMessage(`第${measure + 1}小节拍号未改：后一小节装不下以下口令——${result.unmoved.map((item) => item.label).join("、")}。`, "error");
    return;
  }

  state.pattern = result.pattern;
  state.meters = result.meters;
  persist();

  const total = Meter.totalBeats(state.meters);
  if (playhead > total - 1) playhead = total - 1;

  // 播放中改拍号：按新的实际拍数刷新循环，避免旧定时器沿旧区间运行。
  if (timer) {
    clearInterval(timer);
    const [start] = currentRange();
    if (playhead < start || playhead > currentRange()[1]) playhead = start;
    timer = setInterval(tick, 60000 / state.bpm);
  }

  render();
  if (result.unchanged) {
    showMessage("");
  } else if (result.moved.length > 0) {
    const movedText = result.moved.map((item) => item.label).join("、");
    showMessage(`第${measure + 1}小节已改为${next}拍，溢出口令已搬入第${measure + 2}小节：${movedText}。`, "ok");
  } else {
    showMessage(`第${measure + 1}小节已改为${next}拍，新增拍位留空。`, "ok");
  }
});

pieceName.addEventListener("input", () => {
  state.pieceName = pieceName.value;
  persist();
});

bpmInput.addEventListener("input", () => {
  state.bpm = Number(bpmInput.value || 96);
  persist();
  if (timer) {
    clearInterval(timer);
    timer = setInterval(tick, 60000 / state.bpm);
  }
});

loopSelect.addEventListener("change", () => {
  state.loop = loopSelect.value;
  playhead = currentRange()[0];
  persist();
});

noteInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !noteInput.value.trim()) return;
  state.notes.unshift(noteInput.value.trim());
  noteInput.value = "";
  persist();
  renderNotes();
});

document.querySelector("#playBtn").addEventListener("click", () => {
  if (timer) clearInterval(timer);
  playhead = currentRange()[0];
  tick();
  timer = setInterval(tick, 60000 / state.bpm);
});

document.querySelector("#stopBtn").addEventListener("click", () => {
  clearInterval(timer);
  timer = null;
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));
});

document.querySelector("#saveBtn").addEventListener("click", () => {
  state.saved.unshift(PlanStore.snapshot(state));
  persist();
  renderSaved();
  showMessage(`方案已保存（拍号 ${meterSummary()}）。`, "ok");
});

savedList.addEventListener("click", (event) => {
  const id = event.target.closest("[data-load]")?.dataset.load;
  const item = state.saved.find((entry) => entry.id === id);
  if (!item) return;
  clearInterval(timer);
  timer = null;
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));
  state.pieceName = item.name;
  state.bpm = item.bpm;
  state.loop = item.loop;
  state.notes = [...item.notes];
  state.meters = [...item.meters];
  state.pattern = item.pattern.map((row) => [...row]);
  playhead = 0;
  persist();
  render();
  showMessage(`已载入方案“${item.name}”（拍号 ${state.meters.join("-")}）。`, "ok");
});

render();
