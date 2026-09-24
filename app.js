const { instruments } = SchemeStore;
const { MEASURE_COUNT, BEAT_CHOICES, totalBeats, measureRange, measureStarts, beatLabel, resizeMeasure } = MeterEngine;
const state = SchemeStore.load();

let timer = null;
let playhead = 0;
let audioContext = null;

const grid = document.querySelector("#grid");
const savedList = document.querySelector("#savedList");
const structure = document.querySelector("#structure");
const notesList = document.querySelector("#notesList");
const meterBar = document.querySelector("#meterBar");
const messageBox = document.querySelector("#messageBox");
const pieceName = document.querySelector("#pieceName");
const bpmInput = document.querySelector("#bpmInput");
const loopSelect = document.querySelector("#loopSelect");
const noteInput = document.querySelector("#noteInput");

function save() {
  SchemeStore.save(state);
}

function showMessage(text, isError = false) {
  messageBox.textContent = text;
  messageBox.className = isError ? "message show error" : "message show";
  if (!text) messageBox.className = "message";
}

function clearMessageLater(delay = 3000) {
  setTimeout(() => {
    messageBox.textContent = "";
    messageBox.className = "message";
  }, delay);
}

function syncFields() {
  pieceName.value = state.pieceName;
  bpmInput.value = state.bpm;
  loopSelect.innerHTML = ['<option value="">全段</option>']
    .concat(state.meters.map((beats, measure) =>
      `<option value="${measure}">第${measure + 1}小节（${beats}拍）</option>`))
    .join("");
  loopSelect.value = state.loop;
  meterBar.querySelectorAll("select").forEach((select, measure) => {
    select.value = String(state.meters[measure]);
  });
}

function renderGrid() {
  const steps = totalBeats(state.meters);
  const starts = new Set(measureStarts(state.meters));
  const header = ['<div class="label-cell">乐器</div>'];
  for (let i = 0; i < steps; i += 1) {
    header.push(
      `<div class="beat-cell${starts.has(i) ? " measure-start" : ""}">${beatLabel(state.meters, i)}</div>`
    );
  }

  const rows = instruments.flatMap((instrument, rowIndex) => {
    const row = [`<div class="label-cell">${instrument.name}</div>`];
    for (let step = 0; step < steps; step += 1) {
      const value = state.pattern[rowIndex][step];
      row.push(
        `<button class="cell ${value ? "filled" : ""}${starts.has(step) ? " measure-start" : ""}" `
        + `type="button" data-row="${rowIndex}" data-step="${step}">${value}</button>`
      );
    }
    return row;
  });

  grid.innerHTML = [...header, ...rows].join("");
  grid.style.gridTemplateColumns = `76px repeat(${steps}, minmax(46px, 1fr))`;
  grid.style.minWidth = `${850 + (steps - 16) * 46}px`;
}

function renderSidebars() {
  // 段落统计按各小节实际拍数切分。
  structure.innerHTML = state.meters.map((beats, measure) => {
    const [start, end] = measureRange(state.meters, measure);
    const count = state.pattern
      .flatMap((row) => row.slice(start, end + 1))
      .filter(Boolean).length;
    return `
      <div class="structure-row"><span>第${measure + 1}小节 · ${beats}拍</span><strong>${count}个口令</strong></div>
    `;
  }).join("");

  notesList.innerHTML = state.notes.length ? state.notes.map((note) => `
    <article class="note"><p>${note}</p></article>
  `).join("") : "<p>暂无批注。</p>";

  savedList.innerHTML = state.saved.length ? state.saved.map((item) => `
    <button class="saved-item" type="button" data-load="${item.id}">
      <strong>${item.name}</strong><br>
      <span>${item.bpm}BPM · 拍号 ${item.meters.join("/")} · ${item.notes.length}条批注</span>
    </button>
  `).join("") : "<p>还没有保存方案。</p>";
}

function render() {
  syncFields();
  renderGrid();
  renderSidebars();
  if (playhead >= totalBeats(state.meters)) playhead = totalBeats(state.meters) - 1;
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

// 播放与循环范围都按各小节实际拍数走。
function currentRange() {
  if (state.loop === "") return [0, totalBeats(state.meters) - 1];
  return measureRange(state.meters, Number(state.loop));
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
  save();
  renderSidebars();
  cell.classList.toggle("filled");
  cell.textContent = state.pattern[row][step];
});

meterBar.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-measure]");
  if (!select) return;
  const measure = Number(select.dataset.measure);
  const newBeats = Number(select.value);
  const result = resizeMeasure(state.meters, state.pattern, measure, newBeats);

  if (!result.ok) {
    select.value = String(state.meters[measure]); // 拍号先不改
    if (result.reason === "no-next") {
      showMessage("末小节之后没有可接收口令的小节，拍号未改。", true);
    } else {
      const detail = result.unmoved
        .map((entry) => `第${measure + 1}小节第${entry.beat}拍·${instruments[entry.row].name}“${entry.token}”`)
        .join("；");
      showMessage(`后一小节空拍不够，拍号未改。搬不动的口令：${detail}`, true);
    }
    clearMessageLater(5000);
    return;
  }

  state.meters = result.meters;
  state.pattern = result.pattern;
  if (result.kind === "shortened") {
    showMessage(`已改为${newBeats}拍，${result.moved}列口令搬入后一小节空拍。`);
    clearMessageLater();
  } else if (result.kind === "lengthened") {
    showMessage(`已改为${newBeats}拍，多出的拍位保持空白。`);
    clearMessageLater();
  }
  save();
  render();
});

pieceName.addEventListener("input", () => {
  state.pieceName = pieceName.value;
  save();
});

bpmInput.addEventListener("input", () => {
  state.bpm = Number(bpmInput.value || 96);
  save();
  if (timer) {
    clearInterval(timer);
    timer = setInterval(tick, 60000 / state.bpm);
  }
});

loopSelect.addEventListener("change", () => {
  state.loop = loopSelect.value;
  playhead = currentRange()[0];
  save();
});

noteInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !noteInput.value.trim()) return;
  state.notes.unshift(noteInput.value.trim());
  noteInput.value = "";
  save();
  renderSidebars();
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
  state.saved.unshift(SchemeStore.snapshot(state));
  save();
  renderSidebars();
  showMessage("方案已保存。");
  clearMessageLater();
});

savedList.addEventListener("click", (event) => {
  const id = event.target.closest("[data-load]")?.dataset.load;
  const item = state.saved.find((entry) => entry.id === id);
  if (!item) return;
  state.pieceName = item.name;
  state.bpm = item.bpm;
  state.loop = item.loop;
  state.notes = [...item.notes];
  state.meters = [...item.meters];
  state.pattern = item.pattern.map((row) => [...row]);
  playhead = 0;
  save();
  render();
});

// 初始化拍号选择条。
meterBar.innerHTML = Array.from({ length: MEASURE_COUNT }, (_, measure) => {
  const options = BEAT_CHOICES.map((beats) => `<option value="${beats}">${beats}拍</option>`).join("");
  return `
    <label class="meter-pick">第${measure + 1}小节
      <select data-measure="${measure}">${options}</select>
    </label>
  `;
}).join("");

render();
