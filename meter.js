// 拍号计算：纯逻辑，不碰 localStorage 与 DOM。
// 口令以“列”为单位（同一拍上的若干乐器同时发声），缩小时整列搬入后一小节的整列空拍。
(function () {
  const MEASURE_COUNT = 4;
  const BEAT_CHOICES = [2, 3, 4, 5];

  function totalBeats(meters) {
    return meters.reduce((sum, beats) => sum + beats, 0);
  }

  function measureStart(meters, measure) {
    let start = 0;
    for (let m = 0; m < measure; m += 1) start += meters[m];
    return start;
  }

  // 返回 [起始拍, 结束拍]，均为扁平下标、闭区间。
  function measureRange(meters, measure) {
    const start = measureStart(meters, measure);
    return [start, start + meters[measure] - 1];
  }

  function locate(meters, step) {
    let cursor = 0;
    for (let m = 0; m < meters.length; m += 1) {
      if (step < cursor + meters[m]) return { measure: m, beat: step - cursor };
      cursor += meters[m];
    }
    return { measure: meters.length - 1, beat: meters[meters.length - 1] - 1 };
  }

  function beatLabel(meters, step) {
    const pos = locate(meters, step);
    return `${pos.measure + 1}-${pos.beat + 1}`;
  }

  // 除第 1 小节外，各小节起点的扁平拍位（用于画小节线）。
  function measureStarts(meters) {
    return meters.slice(1).map((_, index) => measureStart(meters, index + 1));
  }

  function toSegments(meters, pattern) {
    const segments = [];
    let cursor = 0;
    meters.forEach((beats) => {
      segments.push(pattern.map((row) => row.slice(cursor, cursor + beats)));
      cursor += beats;
    });
    return segments;
  }

  function fromSegments(segments) {
    const rows = segments[0].map(() => []);
    segments.forEach((segment) => {
      segment.forEach((row, rowIndex) => rows[rowIndex].push(...row));
    });
    return rows;
  }

  function columnHasToken(segment, beat) {
    return segment.some((row) => row[beat]);
  }

  // 改动某小节拍号。
  // 返回 { ok:true, meters, pattern, kind, moved }
  // 或   { ok:false, reason:"no-next"|"overflow", unmoved:[{row,beat,token}] }
  // beat 为该小节内从 1 起的原拍位。
  function resizeMeasure(meters, pattern, measure, newBeats) {
    const oldBeats = meters[measure];
    if (newBeats === oldBeats) {
      return { ok: true, meters: meters.slice(), pattern, kind: "same", moved: 0 };
    }
    if (!BEAT_CHOICES.includes(newBeats) || measure < 0 || measure >= meters.length) {
      return { ok: false, reason: "overflow", unmoved: [] };
    }

    const segments = toSegments(meters, pattern);

    if (newBeats > oldBeats) {
      // 加长：新拍位保持空白，后续小节整体后移。
      const added = newBeats - oldBeats;
      segments[measure] = segments[measure].map((row) => [...row, ...Array(added).fill("")]);
      const nextMeters = meters.slice();
      nextMeters[measure] = newBeats;
      return { ok: true, meters: nextMeters, pattern: fromSegments(segments), kind: "lengthened", moved: 0 };
    }

    // 缩短：收集被截掉的非空列（保持原顺序，记下在原小节内的拍位，1 起）。
    const removed = oldBeats - newBeats;
    const tailColumns = [];
    for (let beat = 0; beat < removed; beat += 1) {
      const sourceBeat = newBeats + beat;
      if (columnHasToken(segments[measure], sourceBeat)) {
        tailColumns.push({
          beat: sourceBeat + 1,
          tokens: segments[measure].map((row) => row[sourceBeat])
        });
      }
    }

    const isLast = measure === meters.length - 1;
    const emptyBeats = isLast ? [] : segments[measure + 1][0]
      .map((_, beat) => beat)
      .filter((beat) => !columnHasToken(segments[measure + 1], beat));

    if (tailColumns.length > emptyBeats.length) {
      // 后一小节装不下：拍号先不改，列出搬不动的口令与原拍位。
      const unmoved = tailColumns
        .slice(emptyBeats.length)
        .flatMap((entry) => entry.tokens
          .map((token, row) => (token ? { row, beat: entry.beat, token } : null))
          .filter(Boolean));
      return { ok: false, reason: isLast ? "no-next" : "overflow", unmoved };
    }

    // 装得下：截断本小节，口令按原顺序填入后一小节空拍。
    segments[measure] = segments[measure].map((row) => row.slice(0, newBeats));
    tailColumns.forEach((entry, index) => {
      const target = emptyBeats[index];
      entry.tokens.forEach((token, row) => {
        if (token) segments[measure + 1][row][target] = token;
      });
    });

    const nextMeters = meters.slice();
    nextMeters[measure] = newBeats;
    return {
      ok: true,
      meters: nextMeters,
      pattern: fromSegments(segments),
      kind: "shortened",
      moved: tailColumns.length
    };
  }

  window.MeterEngine = {
    MEASURE_COUNT,
    BEAT_CHOICES,
    totalBeats,
    measureStart,
    measureRange,
    locate,
    beatLabel,
    measureStarts,
    resizeMeasure
  };
})();
