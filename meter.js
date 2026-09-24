// 拍号计算模块：只做小节边界与改拍号时的口令搬运推演，不碰 DOM、不碰存储。
const Meter = (() => {
  const MEASURE_COUNT = 4;
  const OPTIONS = [2, 3, 4, 5];
  const DEFAULT_METER = 4;

  // 各小节的起始全局拍位，返回长度 n+1 的边界数组。
  function starts(meters) {
    const bounds = [0];
    meters.forEach((beats, index) => {
      bounds[index + 1] = bounds[index] + beats;
    });
    return bounds;
  }

  const totalBeats = (meters) => meters.reduce((sum, beats) => sum + beats, 0);

  // 第 index 小节的全局拍位区间 [起, 止]，止为含端点。
  function range(meters, index) {
    const bounds = starts(meters);
    return [bounds[index], bounds[index + 1] - 1];
  }

  function position(meters, globalBeat) {
    const bounds = starts(meters);
    for (let measure = 0; measure < meters.length; measure += 1) {
      if (globalBeat < bounds[measure + 1]) {
        return { measure, beat: globalBeat - bounds[measure] };
      }
    }
    return null;
  }

  const beatLabel = (meters, globalBeat) => {
    const pos = position(meters, globalBeat);
    return pos ? `${pos.measure + 1}-${pos.beat + 1}` : "";
  };

  function insertBlankBeats(pattern, at, count) {
    return pattern.map((row) => [
      ...row.slice(0, at),
      ...Array.from({ length: count }, () => ""),
      ...row.slice(at)
    ]);
  }

  function removeBeatColumns(pattern, from, to) {
    return pattern.map((row) => [...row.slice(0, from), ...row.slice(to)]);
  }

  function describeItem(item, meters) {
    const pos = position(meters, item.from);
    return {
      token: item.token,
      row: item.row,
      measure: pos.measure + 1,
      beat: pos.beat + 1,
      label: `${item.token}（第${pos.measure + 1}小节第${pos.beat + 1}拍）`
    };
  }

  // 推演把第 measureIndex 小节改成 next 拍的结果。
  // 返回 { ok, unchanged, pattern, meters, moved, unmoved }。
  // ok=false 时拍号与谱面一律不动，unmoved 列出搬不动的口令及原拍位。
  function changeMeter(pattern, meters, measureIndex, next) {
    const prev = meters[measureIndex];
    if (!OPTIONS.includes(next)) {
      throw new Error(`不支持的拍号：${next}`);
    }
    if (next === prev) {
      return { ok: true, unchanged: true, pattern, meters, moved: [], unmoved: [] };
    }

    const nextMeters = meters.map((beats, index) => (index === measureIndex ? next : beats));
    const bounds = starts(meters);

    // 加长：在小节末尾补空白拍，后续内容整体后移。
    if (next > prev) {
      const at = bounds[measureIndex] + prev;
      return {
        ok: true,
        unchanged: false,
        pattern: insertBlankBeats(pattern, at, next - prev),
        meters: nextMeters,
        moved: [],
        unmoved: []
      };
    }

    // 缩短：被裁掉的尾部拍位里的口令要按原顺序搬进后一小节空拍。
    const cut = prev - next;
    const srcFrom = bounds[measureIndex] + next;
    const srcTo = srcFrom + cut;

    // 阅读顺序：先拍位（从左到右），同拍再按乐器行顺序，保证“按原顺序”。
    const overflow = [];
    for (let col = srcFrom; col < srcTo; col += 1) {
      pattern.forEach((row, rowIndex) => {
        if (row[col]) overflow.push({ row: rowIndex, token: row[col], from: col });
      });
    }

    if (overflow.length === 0) {
      return {
        ok: true,
        unchanged: false,
        pattern: removeBeatColumns(pattern, srcFrom, srcTo),
        meters: nextMeters,
        moved: [],
        unmoved: []
      };
    }

    // 最后一小节后面没有“后一小节”，无处可搬。
    if (measureIndex === meters.length - 1) {
      return {
        ok: false,
        unchanged: true,
        pattern,
        meters,
        moved: [],
        unmoved: overflow.map((item) => describeItem(item, meters))
      };
    }

    const dstFrom = bounds[measureIndex + 1];
    const dstTo = bounds[measureIndex + 2];
    const draft = pattern.map((row) => [...row]);

    // 单调指针贪心：按源拍分组，同一拍的多件乐器可共享目标拍，
    // 来自更晚源拍的口令必须落到更靠右的空拍；取最早可放位置给后续留最大余地。
    let pointer = dstFrom;
    let groupFrom = -1;
    let groupMinTarget = null;
    const moved = [];
    const unmoved = [];
    overflow.forEach((item) => {
      if (item.from !== groupFrom) {
        if (groupMinTarget !== null) pointer = groupMinTarget + 1;
        groupFrom = item.from;
        groupMinTarget = null;
      }
      let target = -1;
      for (let col = pointer; col < dstTo; col += 1) {
        if (!draft[item.row][col]) {
          target = col;
          break;
        }
      }
      if (target === -1) {
        unmoved.push(describeItem(item, meters));
      } else {
        draft[item.row][target] = item.token;
        moved.push({ ...describeItem(item, meters), to: target });
        if (groupMinTarget === null || target < groupMinTarget) groupMinTarget = target;
      }
    });

    // 后一小节装不下：整次改拍号作废，谱面与拍号保持原样。
    if (unmoved.length > 0) {
      return { ok: false, unchanged: true, pattern, meters, moved: [], unmoved };
    }

    return {
      ok: true,
      unchanged: false,
      pattern: removeBeatColumns(draft, srcFrom, srcTo),
      meters: nextMeters,
      moved,
      unmoved: []
    };
  }

  return {
    MEASURE_COUNT,
    OPTIONS,
    DEFAULT_METER,
    starts,
    totalBeats,
    range,
    position,
    beatLabel,
    changeMeter
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Meter };
}
