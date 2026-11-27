import {
  cyclesHue,
  effectSample,
  type EffectInput,
  type EffectCell,
} from "./effectShapes";
import type { Catalog, State } from "../rpc/generated/lighting";
import {
  Field,
  palette,
  rainbow,
  rendererNames,
  type Group,
  type LedTopology,
  unassigned,
} from "../rpc/lightingEditor";

import type { StatusColor } from "./statusPreview";

type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  r?: number;
  rx?: number;
  ry?: number;
};
export function previewGrid(keys: Geometry[]) {
  // Firmware geometry uses hundredths of a key unit and hundredths of a degree.
  const centers = keys.map((k) => {
    const angle = ((k.r ?? 0) * Math.PI) / 18000;
    const ox = k.rx ?? k.x,
      oy = k.ry ?? k.y;
    const dx = k.x + k.width / 2 - ox,
      dy = k.y + k.height / 2 - oy;
    return {
      x: (ox + dx * Math.cos(angle) - dy * Math.sin(angle)) / 100,
      y: (oy + dx * Math.sin(angle) + dy * Math.cos(angle)) / 100,
    };
  });
  const left = Math.min(...centers.map((p) => p.x)),
    top = Math.min(...centers.map((p) => p.y));
  const points = centers.map(({ x, y }) => ({
    x,
    y,
    row: Math.round(y - top),
    col: Math.round(x - left),
    rank: 0,
  }));
  // Legacy firmware only supplies physical geometry.
  [...points]
    .sort((a, b) => a.row - b.row || a.x - b.x)
    .forEach((p, i) => {
      p.rank = i;
    });
  return {
    points,
    rows: 1 + Math.max(0, ...points.map((p) => p.row)),
    cols: 1 + Math.max(0, ...points.map((p) => p.col)),
  };
}
export type PreviewGrid = ReturnType<typeof previewGrid>;

function previewColor(value: number) {
  if (value === palette || value === rainbow)
    return { token: value, h: 0, s: 100, l: 50 };
  const [r, g, b] = [16, 8, 0].map((shift) => ((value >> shift) & 255) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (delta) {
    if (max === r) h = (g - b) / delta;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return {
    token: value,
    h: (h * 60 + 360) % 360,
    s: delta ? (100 * delta) / (1 - Math.abs(2 * l - 1)) : 0,
    l: l * 100,
  };
}

export function makePreview(
  catalog: Catalog,
  state: State,
  group?: Group,
  topology?: LedTopology,
  layer?: Group,
  started = 0,
  status?: Map<number, StatusColor>,
) {
  const profile = catalog.profiles.find((p) => p.id === state.profile);
  if (
    !state.brightness ||
    (!status?.size && (!state.enabled || (!profile && !group && !layer)))
  )
    return;
  const values = group?.values;
  const number = (field: Field, fallback: number) =>
    typeof values?.[field] === "number" ? Number(values[field]) : fallback;
  const renderer =
    rendererNames[number(Field.Renderer, -1)]?.toLowerCase() ??
    profile?.renderer.toLowerCase() ??
    "solid";
  if (!rendererNames.some((name) => name.toLowerCase() === renderer)) return;
  const primary = values?.[Field.Primary];
  const colors = (
    Array.isArray(primary) ? (primary.length ? primary : [0]) : [palette]
  ).map(previewColor);
  const brightness = state.enabled
    ? (state.brightness * number(Field.Brightness, 100)) / 10000
    : 0;
  const layerColors = layer?.values[Field.Primary];
  const overlay =
    topology &&
    layer &&
    !layer.values[Field.Disabled] &&
    Array.isArray(layerColors)
      ? {
          colors: new Map(
            layer.leds.map((led, i) => [
              led,
              previewColor(layerColors[layerColors.length === 1 ? 0 : i] ?? 0),
            ]),
          ),
          brightness:
            (state.brightness * Number(layer.values[Field.Brightness] ?? 100)) /
            10000,
          dynamic: layerColors.includes(rainbow),
          until: Number(layer.values[Field.DisplayTime])
            ? started + Number(layer.values[Field.DisplayTime])
            : Infinity,
        }
      : undefined;
  if (!brightness && !overlay && !status?.size) return;
  // Earlier directory versions omit the configured starting speed.
  const speedRatio =
    (topology?.grid?.defaultSpeed ??
      Math.max(1, Math.min(4, catalog.maxSpeed))) / Math.max(1, state.speed);
  const members = new Map(group?.leds?.map((led, index) => [led, index]));
  return {
    renderer,
    extended: rendererNames.findIndex((n) => n.toLowerCase() === renderer) >= 8,
    style: number(Field.Style, 0),
    reverse: !!number(Field.Direction, 0),
    grid: topology?.grid,
    cells: new Map<number, EffectCell>(
      topology?.leds.flatMap(({ row, col }, led) =>
        row !== undefined &&
        col !== undefined &&
        row !== unassigned &&
        col !== unassigned
          ? [[led, { row, col }] as const]
          : [],
      ) ?? [],
    ),
    status:
      status &&
      new Map(
        Array.from(status, ([led, { value, index }]) => [
          led,
          {
            color: value === undefined ? undefined : previewColor(value),
            index,
          },
        ]),
      ),
    masterBrightness: state.brightness / 100,
    overlay,
    positions:
      topology &&
      new Map(
        topology.leds.flatMap(({ position }, led) =>
          position === unassigned
            ? []
            : [[position, { led, index: members.get(led) ?? -1 }] as const],
        ),
      ),
    logicalCount: topology?.leds.length,
    members,
    colors,
    brightness,
    hue: (state.hue * 360) / Math.max(1, catalog.hueCount),
    period: Math.max(
      1,
      Math.trunc(Math.max(1, number(Field.Period, 1800)) * speedRatio),
    ),
    rainbowPeriod: 2400 * speedRatio,
    afterglow: number(Field.Afterglow, 150),
    fade: number(Field.Fade, 250),
    range: number(Field.Range, 0),
    dynamicColor:
      colors.some((c) => c.token === rainbow) ||
      Array.from(status?.values() ?? []).some((c) => c.value === rainbow),
  };
}

type SidePreview = NonNullable<ReturnType<typeof makePreview>>;
export type MatrixPreview = SidePreview & { sides?: SidePreview[] };
export type KeyPresses = Map<number, { start: number; end?: number }> & {
  input?: EffectInput;
};

function noise(seed: number) {
  let x = Math.imul(seed ^ 0x51ed270b, 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

// Freeze a visible phase even on a layout with just one key.
export function stillFrameTime(effect: MatrixPreview, grid: PreviewGrid) {
  const first = grid.points[0];
  if (first && effect.renderer === "rain") {
    const head = (first.row + 0.5) / (grid.rows + 4);
    const phase = (1 + head - noise(first.col + 1)) % 1;
    return (phase * effect.period) / (0.8 + 0.6 * noise(first.col));
  }
  if (first && effect.renderer === "starlight")
    return ((1 + 1 / 16 - noise(first.rank)) % 1) * effect.period;
  return effect.period / 2;
}

export function sampleLight(
  effect: MatrixPreview,
  grid: PreviewGrid,
  index: number,
  time: number,
  presses: KeyPresses,
  displayTime = time,
) {
  const led = effect.positions?.get(index)?.led;
  const overlay = overlayLight(effect, led, time, displayTime);
  if (overlay) return overlay;
  const { renderer, period } = effect,
    point = grid.points[index];
  const phase = (time % period) / period;
  let intensity = 1,
    source = point,
    sourceIndex = index,
    shift = 0;
  switch (renderer) {
    default: {
      if (!effect.extended) break;
      const mapped = effect.positions?.get(index);
      const sample = effectSample(
        effect,
        effect.grid ? effect.cells.get(mapped?.led ?? -1) : point,
        effect.grid ?? grid,
        time,
        mapped?.led ?? index,
        mapped?.index ?? point.rank,
        mapped ? effect.members.size : grid.points.length,
        presses.input,
      );
      intensity = sample.level / 100;
      shift = sample.hue;
      break;
    }
    case "breathe":
      intensity = (1 - Math.abs(2 * phase - 1)) ** 2;
      break;
    case "spectrum":
    case "swirl":
      shift =
        360 *
        (phase +
          (renderer === "swirl"
            ? (effect.positions?.get(index)?.led ?? point.rank) /
              (effect.logicalCount ?? grid.points.length)
            : 0));
      break;
    case "keypress":
      intensity = 0;
      for (const [key, { end }] of presses) {
        const origin = grid.points[key];
        const distance = Math.round(
          Math.max(Math.abs(origin.x - point.x), Math.abs(origin.y - point.y)),
        );
        if (distance > effect.range) continue;
        const age =
          end === undefined ? 0 : Math.max(0, time - end - effect.afterglow);
        const level =
          (age ? Math.max(0, 1 - age / Math.max(1, effect.fade)) : 1) *
          (1 - distance / (effect.range + 1)) ** 2;
        if (level > intensity) {
          intensity = level;
          source = origin;
          sourceIndex = key;
        }
      }
      break;
    case "ripple": {
      intensity = 0;
      for (const [key, { start }] of presses) {
        const origin = grid.points[key];
        const distance = Math.round(
          Math.abs(origin.x - point.x) + Math.abs(origin.y - point.y),
        );
        const step = Math.max(25, period / (grid.rows + grid.cols + 2));
        const delta = distance - Math.floor((time - start) / step);
        intensity =
          delta === 0
            ? 1
            : Math.abs(delta) === 1
              ? 0.4
              : delta === -2
                ? 0.2
                : 0;
      }
      break;
    }
    case "rain": {
      const cycle =
        (time / period) * (0.8 + 0.6 * noise(point.col)) + noise(point.col + 1);
      const head = Math.floor((cycle % 1) * (grid.rows + 4));
      intensity = [1, 0.44, 0.2][head - point.row] ?? 0;
      break;
    }
    case "starlight": {
      const sparkle = (phase + noise(point.rank)) % 1;
      intensity = Math.max(0, 1 - Math.abs(16 * sparkle - 1)) * 0.7;
      const meteor = time / Math.max(1600, period * 2);
      const slot = Math.floor(meteor);
      if (
        noise(slot) < 0.33 &&
        point.row === Math.floor(noise(slot + 1) * grid.rows)
      ) {
        const col = slot % 2 ? grid.cols - 1 - point.col : point.col;
        const tail = Math.floor((meteor % 1) * (grid.cols + 3)) - col;
        intensity = Math.max(intensity, [1, 0.5, 0.2][tail] ?? 0);
      }
      break;
    }
  }
  const mapped = effect.positions?.get(sourceIndex);
  const fraction = mapped
    ? mapped.led / effect.logicalCount!
    : source.rank / grid.points.length;
  const color =
    effect.colors[
      mapped
        ? effect.colors.length === 1
          ? 0
          : Math.max(0, mapped.index)
        : Math.floor(fraction * effect.colors.length)
    ];
  if (
    !color ||
    (effect.positions &&
      ((effect.positions.get(index)?.index ?? -1) < 0 || !mapped))
  )
    return { h: 0, s: 0, l: 0, alpha: 0 };
  const base =
    effect.extended && !color.s && cyclesHue(effect)
      ? { ...color, s: 100, l: color.l / 2 }
      : color;
  return baseColor(effect, base, fraction, time, intensity, shift);
}

function baseColor(
  effect: MatrixPreview,
  color: ReturnType<typeof previewColor>,
  fraction: number,
  time: number,
  intensity: number,
  shift: number,
  brightness = effect.brightness,
) {
  let hue = color.h;
  if (color.token === palette || color.token === rainbow) hue = effect.hue;
  if (color.token === rainbow)
    hue +=
      360 * ((time % effect.rainbowPeriod) / effect.rainbowPeriod + fraction);
  const alpha = color.l ? brightness * intensity : 0;
  return {
    h: Math.round(hue + shift) % 360,
    s: Math.round(color.s),
    l: Math.round(color.l),
    alpha,
  };
}

function overlayLight(
  effect: MatrixPreview,
  led: number | undefined,
  time: number,
  displayTime: number,
) {
  const overlay = effect.overlay;
  const overlayColor = led !== undefined && overlay?.colors.get(led);
  if (overlay && overlayColor && displayTime < overlay.until) {
    const { token, h, s, l } = overlayColor;
    const hue =
      token === rainbow
        ? effect.hue +
          360 * (time / effect.rainbowPeriod + led! / effect.logicalCount!)
        : token === palette
          ? effect.hue
          : h;
    return {
      h: Math.round(hue) % 360,
      s: Math.round(s),
      l: Math.round(l),
      alpha: l ? overlay.brightness : 0,
    };
  }
}

export function sampleExtraLight(
  effect: MatrixPreview,
  led: number,
  time: number,
  independent: boolean,
  displayTime = time,
) {
  const status = effect.status?.get(led);
  if (status)
    return status.color
      ? baseColor(
          effect,
          status.color,
          status.index / (effect.logicalCount || 1),
          time,
          1,
          0,
          effect.masterBrightness,
        )
      : { h: 0, s: 0, l: 0, alpha: 0 };
  const overlay = overlayLight(effect, led, time, displayTime);
  if (overlay) return overlay;
  const index = effect.members.get(led);
  const color =
    index === undefined
      ? undefined
      : effect.colors[effect.colors.length === 1 ? 0 : index];
  if (!color || index === undefined) return { h: 0, s: 0, l: 0, alpha: 0 };
  const position = independent ? index : led;
  const fraction = position / (effect.logicalCount || 1);
  const phase = (time % effect.period) / effect.period;
  let intensity = 1,
    shift = 0;
  switch (effect.renderer) {
    default: {
      if (!effect.extended) break;
      const sample = effectSample(
        effect,
        effect.cells.get(led),
        effect.grid ?? { rows: 0, cols: 0 },
        time,
        led,
        index,
        effect.members.size,
      );
      intensity = sample.level / 100;
      shift = sample.hue;
      break;
    }
    case "breathe":
      intensity = (1 - Math.abs(2 * phase - 1)) ** 2;
      break;
    case "spectrum":
      shift = 360 * phase;
      break;
    case "swirl":
      shift =
        360 * (phase + (independent ? index / effect.members.size : fraction));
      break;
    case "starlight":
      intensity =
        Math.max(0, 1 - Math.abs(16 * ((phase + noise(led)) % 1) - 1)) * 0.7;
      break;
    case "rain":
    case "ripple":
    case "keypress":
      // These renderers address matrix cells. No cell coordinates are on the wire for extra LEDs.
      intensity = 0;
      break;
  }
  const base =
    effect.extended && !color.s && cyclesHue(effect)
      ? { ...color, s: 100, l: color.l / 2 }
      : color;
  return baseColor(effect, base, fraction, time, intensity, shift);
}
