// The firmware uses integer cell coordinates and integer phase arithmetic.
const div = (n: number, d: number) => Math.trunc(n / d);
const wrap = (n: number, m: number) => ((n % m) + m) % m;
const triangle = (p: number) =>
  100 - div(Math.abs(wrap(p, 360) - 180) * 100, 180);

function angle(x: number, y: number) {
  const ax = Math.abs(x),
    ay = Math.abs(y);
  if (!ax && !ay) return 0;
  let a = ax >= ay ? div(45 * ay, ax) : 90 - div(45 * ax, ay);
  if (x < 0) a = 180 - a;
  return y < 0 ? -a : a;
}
function hash(seed: number) {
  let v = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
  v = Math.imul(v ^ (v >>> 15), 0x846ca68b);
  return (v ^ (v >>> 16)) >>> 0;
}
export type EffectCell = { row: number; col: number };
type Grid = { rows: number; cols: number };
export type EffectOptions = {
  renderer: string;
  style: number;
  reverse: boolean;
  period: number;
};
type Heat = { level: number; time: number };
export type EffectInput = {
  hits: (EffectCell & { time: number })[];
  heat: Map<number, Heat>;
};
export function cooled(heat: Heat | undefined, now: number, period: number) {
  return heat
    ? Math.max(0, heat.level - div(Math.max(0, now - heat.time) * 100, period))
    : 0;
}
export function strike(
  input: EffectInput,
  effect: EffectOptions,
  origin: EffectCell,
  cells: Map<number, EffectCell>,
  now: number,
) {
  if (effect.renderer === "reactive") {
    input.hits.push({ ...origin, time: now });
    if (input.hits.length > 8) input.hits.shift();
  } else if (effect.renderer === "heatmap") {
    for (const [led, cell] of cells) {
      const distance =
        Math.abs(cell.row - origin.row) + Math.abs(cell.col - origin.col);
      if (distance <= 1)
        input.heat.set(led, {
          time: now,
          level: Math.min(
            100,
            cooled(input.heat.get(led), now, effect.period) +
              (distance ? 12 : 40),
          ),
        });
    }
  }
}
export function effectSample(
  effect: EffectOptions,
  cell: EffectCell | undefined,
  grid: Grid,
  now: number,
  led: number,
  rank: number,
  count: number,
  input?: EffectInput,
) {
  const { renderer, style, reverse } = effect;
  const period = Math.max(1, Math.trunc(effect.period));
  now = Math.trunc(now);
  let hue = 0,
    level = 100;
  if (!cell && renderer !== "chase") return { hue, level: 0 };
  const { row, col } = cell ?? { row: 0, col: 0 };
  const x = grid.cols > 1 ? div(col * 256, grid.cols - 1) : 128;
  const y = grid.rows > 1 ? div(row * 256, grid.rows - 1) : 128;
  const dx = x - 128,
    dy = y - 128;
  const phase = div((now % period) * 360, period) * (reverse ? -1 : 1);
  switch (renderer) {
    case "gradient": {
      let axis = style === 1 || style === 3 ? y : x;
      if (reverse) axis = 256 - axis;
      if (style >= 2) axis = div(axis * 3, 256) * 85;
      hue = axis;
      level = 35 + div(axis * 65, 256);
      break;
    }
    case "wave": {
      let axis = style === 1 ? y : x;
      if (style === 2) axis += Math.abs(dy);
      if (style === 3) axis += triangle(y + phase) - 2 * triangle(phase);
      hue = axis - phase;
      if (style === 4) {
        level = triangle(hue);
        hue = 0;
      }
      break;
    }
    case "radial": {
      let d = Math.abs(dx) + Math.abs(dy);
      if (style === 1) d = Math.abs(Math.abs(dx) - 64) + Math.abs(dy);
      if (style === 2) d = Math.abs(dx) + (reverse ? y : 256 - y);
      hue = 2 * d - (style === 2 ? Math.abs(phase) : phase);
      level = 25 + div(triangle(hue) * 3, 4);
      break;
    }
    case "rotary": {
      let band = 2 * angle(dx, dy) - phase;
      if (style === 1 || style === 2) band += Math.abs(dx) + Math.abs(dy);
      hue = style === 2 || style === 3 ? 0 : band;
      if (style >= 2) level = triangle(band);
      break;
    }
    case "particles": {
      const seed = style === 2 ? div(row, 3) * grid.cols + div(col, 3) : rank;
      const tick = (now + (hash(seed + 1) % period)) >>> 0;
      const variation = hash(seed ^ Math.imul(div(tick, period), 2654435761));
      let pulse =
        div((tick % period) * 360, period) -
        (variation % (style === 2 ? 160 : 240));
      if (style === 2)
        pulse -= 32 * (Math.abs((col % 3) - 1) + Math.abs((row % 3) - 1));
      level = pulse >= 0 && pulse < 120 ? triangle(pulse * 3) : 0;
      if (style) hue = variation % 360;
      break;
    }
    case "chase": {
      const head = div((now % period) * count, period);
      const tail = wrap(head - (reverse ? count - 1 - rank : rank), count);
      level = tail < 4 ? 100 >> tail : 0;
      break;
    }
    case "reactive": {
      level = style === 6 ? 18 : 0;
      for (const hit of input?.hits ?? []) {
        const progress = div((now - hit.time) * 100, period);
        if (progress >= 100 || progress < 0) continue;
        const dr = Math.abs(row - hit.row),
          dc = Math.abs(col - hit.col),
          d = dr + dc;
        const fade = 100 - progress;
        if (style === 1 && dr && dc) continue;
        const delta = Math.abs(
          (style === 2 ? Math.max(dr, dc) : d) -
            div(progress * (grid.rows + grid.cols), 100),
        );
        const value =
          style === 0
            ? d < 3
              ? div(fade, 1 + d)
              : 0
            : style === 3
              ? dc
                ? 0
                : fade
              : delta === 0
                ? fade
                : delta === 1
                  ? div(fade, 2)
                  : 0;
        if (value > level) {
          level = value;
          if (style === 5) hue = d * 45 + progress * 2;
        }
      }
      break;
    }
    case "heatmap":
      level = cooled(input?.heat.get(led), now, period);
      hue = (100 - level) * 2;
      break;
  }
  return { hue: wrap(hue, 360), level };
}

export function cyclesHue({ renderer, style }: EffectOptions) {
  switch (renderer) {
    case "gradient":
    case "radial":
    case "heatmap":
      return true;
    case "wave":
      return style !== 4;
    case "rotary":
      return style !== 2 && style !== 3;
    case "reactive":
      return style === 5;
    case "particles":
      return style !== 0;
    default:
      return false;
  }
}
