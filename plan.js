// 方案版本与存储模块：只管序列化、载入时的版本迁移与归一化，不碰 DOM、不管拍号推演。
const PlanStore = (() => {
  const storageKey = "wxyy-4-luogujing-grid";
  const VERSION = 2;

  const instruments = [
    { name: "大锣", token: "仓", freq: 180 },
    { name: "鼓", token: "冬", freq: 120 },
    { name: "钹", token: "才", freq: 360 },
    { name: "小锣", token: "台", freq: 520 }
  ];
  const steps = 16;

  const defaultMeters = () => Array.from({ length: Meter.MEASURE_COUNT }, () => Meter.DEFAULT_METER);

  function createDefaultState() {
    return {
      version: VERSION,
      pieceName: "出场锣鼓-慢起",
      bpm: 96,
      loop: "",
      notes: [],
      meters: defaultMeters(),
      pattern: instruments.map((instrument) =>
        Array.from({ length: steps }, (_, index) => index % 4 === 0 ? instrument.token : "")
      ),
      saved: []
    };
  }

  // 旧方案 / 旧工作区状态没有每小节拍号这一项，统一按四拍载入。
  function normalizeMeters(meters) {
    if (!Array.isArray(meters)) return defaultMeters();
    return Array.from({ length: Meter.MEASURE_COUNT }, (_, index) =>
      Meter.OPTIONS.includes(meters[index]) ? meters[index] : Meter.DEFAULT_METER
    );
  }

  // 让谱面行数与拍位总数和当前拍号对齐，载入来源不可信时只做兜底修整。
  function fitPattern(pattern, expectedRows, expectedCols) {
    const source = Array.isArray(pattern) ? pattern : [];
    return Array.from({ length: expectedRows }, (_, rowIndex) => {
      const row = Array.isArray(source[rowIndex]) ? source[rowIndex] : [];
      return Array.from(
        { length: expectedCols },
        (_, colIndex) => (row[colIndex] === undefined ? "" : row[colIndex])
      );
    });
  }

  function migrate(raw) {
    if (!raw || typeof raw !== "object") return createDefaultState();

    const base = createDefaultState();
    const meters = normalizeMeters(raw.meters);
    const next = {
      version: VERSION,
      pieceName: typeof raw.pieceName === "string" ? raw.pieceName : base.pieceName,
      bpm: Number.isFinite(Number(raw.bpm)) ? Number(raw.bpm) : base.bpm,
      loop: raw.loop === undefined || raw.loop === null ? "" : String(raw.loop),
      notes: Array.isArray(raw.notes) ? raw.notes.filter((note) => typeof note === "string") : [],
      meters,
      pattern: fitPattern(raw.pattern, instruments.length, Meter.totalBeats(meters)),
      saved: []
    };

    // 已存方案各自带自己的拍号；旧存档项没有拍号，载入时按四拍解释。
    next.saved = Array.isArray(raw.saved)
      ? raw.saved
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const itemMeters = normalizeMeters(item.meters);
            return {
              id: item.id || crypto.randomUUID(),
              name: typeof item.name === "string" ? item.name : "未命名片段",
              bpm: Number.isFinite(Number(item.bpm)) ? Number(item.bpm) : base.bpm,
              loop: item.loop === undefined || item.loop === null ? "" : String(item.loop),
              notes: Array.isArray(item.notes) ? item.notes.filter((note) => typeof note === "string") : [],
              meters: itemMeters,
              pattern: fitPattern(item.pattern, instruments.length, Meter.totalBeats(itemMeters)),
              createdAt: item.createdAt || new Date().toISOString()
            };
          })
      : [];

    return next;
  }

  function load() {
    try {
      return migrate(JSON.parse(localStorage.getItem(storageKey) || "null"));
    } catch (error) {
      return createDefaultState();
    }
  }

  function save(state) {
    localStorage.setItem(storageKey, JSON.stringify({ ...state, version: VERSION }));
  }

  // 从当前工作区生成一条带拍号的存档。
  function snapshot(state) {
    return {
      id: crypto.randomUUID(),
      name: state.pieceName || "未命名片段",
      bpm: state.bpm,
      loop: state.loop,
      notes: [...state.notes],
      meters: [...state.meters],
      pattern: state.pattern.map((row) => [...row]),
      createdAt: new Date().toISOString()
    };
  }

  return { VERSION, instruments, createDefaultState, normalizeMeters, migrate, load, save, snapshot };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PlanStore };
}
