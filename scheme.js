// 方案版本：localStorage 读写与版本兼容，不碰 DOM 与播放。
(function () {
  const storageKey = "wxyy-4-luogujing-grid";
  const SCHEME_VERSION = 2;
  const instruments = [
    { name: "大锣", token: "仓", freq: 180 },
    { name: "鼓", token: "冬", freq: 120 },
    { name: "钹", token: "才", freq: 360 },
    { name: "小锣", token: "台", freq: 520 }
  ];
  const N = window.MeterEngine.MEASURE_COUNT;

  function defaultMeters() {
    return Array(N).fill(4);
  }

  function defaultPattern() {
    const steps = N * 4;
    return instruments.map((instrument) =>
      Array.from({ length: steps }, (_, index) => (index % 4 === 0 ? instrument.token : ""))
    );
  }

  function defaultState() {
    return {
      version: SCHEME_VERSION,
      pieceName: "出场锣鼓-慢起",
      bpm: 96,
      loop: "",
      meters: defaultMeters(),
      notes: [],
      pattern: defaultPattern(),
      saved: []
    };
  }

  function normalizeMeters(value) {
    const choices = window.MeterEngine.BEAT_CHOICES;
    if (!Array.isArray(value)) return defaultMeters();
    const meters = defaultMeters();
    for (let i = 0; i < N; i += 1) {
      // 旧方案没有这项设置：仍按四拍载入。
      if (choices.includes(Number(value[i]))) meters[i] = Number(value[i]);
    }
    return meters;
  }

  function normalizePattern(value, expected) {
    if (!Array.isArray(value) || value.length !== instruments.length) return defaultPattern();
    return value.map((row, rowIndex) => {
      if (!Array.isArray(row)) return defaultPattern()[rowIndex];
      const next = [];
      for (let i = 0; i < expected; i += 1) {
        next.push(row[i] && instruments.some((inst) => inst.token === row[i]) ? row[i] : "");
      }
      return next;
    });
  }

  function normalizeSavedItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const meters = normalizeMeters(raw.meters);
    const pattern = normalizePattern(raw.pattern, window.MeterEngine.totalBeats(meters));
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
      name: typeof raw.name === "string" && raw.name ? raw.name : "未命名片段",
      bpm: Number.isFinite(Number(raw.bpm)) ? Number(raw.bpm) : 96,
      loop: /^[0-3]$/.test(String(raw.loop)) ? String(raw.loop) : "",
      meters,
      notes: Array.isArray(raw.notes) ? raw.notes.filter((note) => typeof note === "string") : [],
      pattern,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString()
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return defaultState();
    const state = defaultState();
    state.version = SCHEME_VERSION;
    if (typeof raw.pieceName === "string") state.pieceName = raw.pieceName;
    if (Number.isFinite(Number(raw.bpm))) state.bpm = Number(raw.bpm);
    if (/^[0-3]$/.test(String(raw.loop))) state.loop = String(raw.loop);
    state.meters = normalizeMeters(raw.meters);
    state.notes = Array.isArray(raw.notes)
      ? raw.notes.filter((note) => typeof note === "string")
      : [];
    state.pattern = normalizePattern(raw.pattern, window.MeterEngine.totalBeats(state.meters));
    // 旧版存档里的方案同样补四拍载入。
    state.saved = Array.isArray(raw.saved)
      ? raw.saved.map(normalizeSavedItem).filter(Boolean)
      : [];
    return state;
  }

  function load() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      raw = null;
    }
    return normalizeState(raw);
  }

  function save(state) {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ ...state, version: SCHEME_VERSION })
    );
  }

  // 存进“已存方案”的快照：记住每小节拍号。
  function snapshot(state) {
    return {
      id: crypto.randomUUID(),
      name: state.pieceName || "未命名片段",
      bpm: state.bpm,
      loop: state.loop,
      meters: [...state.meters],
      notes: [...state.notes],
      pattern: state.pattern.map((row) => [...row]),
      createdAt: new Date().toISOString()
    };
  }

  window.SchemeStore = {
    SCHEME_VERSION,
    instruments,
    load,
    save,
    snapshot
  };
})();
