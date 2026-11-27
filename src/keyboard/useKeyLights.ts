import { cooled, strike } from "./effectShapes";
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import {
  sampleLight,
  sampleExtraLight,
  stillFrameTime,
  type KeyPresses,
  type MatrixPreview,
  type PreviewGrid,
} from "./matrixPreview";

export function useKeyLights(
  container: RefObject<HTMLDivElement>,
  grid?: PreviewGrid,
  effect?: MatrixPreview,
  layerKey?: string,
  extra?: "main" | "zone",
) {
  const press = useRef<(key: number, down: boolean) => void>();
  useLayoutEffect(() => {
    if (!effect || !grid || !container.current) return;
    const layout = grid;
    const keys = Array.from(
      container.current.querySelectorAll<HTMLElement>(
        extra ? "[data-extra-led]" : "button[data-position]",
      ),
    );
    const previous = keys.map(() => "");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scenes = (effect.sides ?? [effect]).map((e) => ({
      e,
      reactive:
        !extra &&
        ["keypress", "ripple", "reactive", "heatmap"].includes(e.renderer),
      stillTime: stillFrameTime(e, layout),
      rippleDuration:
        Math.max(25, e.period / (layout.rows + layout.cols + 2)) *
        (layout.rows + layout.cols + 2),
      presses: new Map() as KeyPresses,
      keys: keys
        .map((key, i) => ({ key, i: extra ? Number(key.dataset.extraLed) : i }))
        .filter(({ i }) => extra || !e.positions || e.positions.has(i)),
    }));
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let frame = 0,
      lastPaint = -Infinity;
    function draw(now: number) {
      frame = 0;
      clearTimeout(expiry);
      if (document.hidden) return;
      const nextExpiry = Math.min(
        ...scenes
          .map(({ e }) => e.overlay?.until ?? Infinity)
          .filter((t) => t > now),
      );
      if (Number.isFinite(nextExpiry))
        expiry = setTimeout(refresh, Math.ceil(nextExpiry - now));
      let animated = false;
      for (const {
        e,
        reactive,
        stillTime,
        rippleDuration,
        presses,
        keys,
      } of scenes) {
        let moving =
          !reactive &&
          e.renderer !== "solid" &&
          e.renderer !== "gradient" &&
          !(
            extra &&
            ["keypress", "ripple", "rain", "heatmap", "reactive"].includes(
              e.renderer,
            )
          );
        for (const [key, p] of presses) {
          if (
            e.renderer === "ripple"
              ? now - p.start >= rippleDuration
              : p.end !== undefined && now - p.end >= e.afterglow + e.fade
          )
            presses.delete(key);
          else if (e.renderer === "ripple" || p.end !== undefined)
            moving = true;
        }
        if (presses.input) {
          const input = presses.input;
          input.hits = input.hits.filter((hit) => now - hit.time < e.period);
          for (const [led, h] of input.heat)
            if (!cooled(h, now, e.period)) input.heat.delete(led);
          moving ||= !!(input.hits.length || input.heat.size);
        }
        moving ||= !!e.overlay && now < e.overlay.until && e.overlay.dynamic;
        moving ||=
          e.dynamicColor &&
          (!reactive ||
            moving ||
            presses.size > 0 ||
            (e.renderer === "reactive" && e.style === 6));
        animated ||= moving && (!motion.matches || reactive);
        const time = motion.matches && !reactive ? stillTime : now;
        for (const { key, i } of keys) {
          const { h, s, l, alpha } = extra
            ? sampleExtraLight(e, i, time, extra === "zone", now)
            : sampleLight(e, layout, i, time, presses, now);
          const color =
            alpha > 0
              ? `hsl(${h} ${s}% ${l}% / ${alpha.toFixed(3)})`
              : "transparent";
          if (previous[i] !== color) {
            key.style.setProperty("--matrix-light", color);
            previous[i] = color;
          }
        }
      }
      lastPaint = now;
      if (animated) frame = requestAnimationFrame(tick);
    }
    function tick(now: number) {
      if (now - lastPaint >= 1000 / 30) draw(now);
      else frame = requestAnimationFrame(tick);
    }
    function refresh() {
      cancelAnimationFrame(frame);
      draw(performance.now());
    }
    function resetPresses() {
      for (const scene of scenes) {
        scene.presses.clear();
        scene.presses.input = undefined;
      }
      refresh();
    }
    press.current = (key, down) => {
      const scene = scenes.find(
        ({ e }) => !e.positions || e.positions.has(key),
      );
      if (!scene?.reactive) return;
      const { e, presses } = scene;
      const now = performance.now();
      if (e.renderer === "reactive" || e.renderer === "heatmap") {
        if (!down) return;
        const mapped = e.positions?.get(key);
        if (mapped && mapped.index < 0) return;
        const led = mapped?.led ?? key;
        const cells = e.grid
          ? e.cells
          : new Map(
              layout.points.map((p, i) => [e.positions?.get(i)?.led ?? i, p]),
            );
        const cell = cells.get(led);
        if (!cell) return;
        presses.input ??= { hits: [], heat: new Map() };
        strike(presses.input, e, cell, cells, Math.trunc(now));
      } else if (down) {
        if (e.renderer === "ripple") presses.clear();
        presses.set(key, { start: now });
      } else {
        const p = presses.get(key);
        if (p) p.end = now;
      }
      refresh();
    };
    refresh();
    motion.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", resetPresses);
    window.addEventListener("blur", resetPresses);
    return () => {
      clearTimeout(expiry);
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", resetPresses);
      window.removeEventListener("blur", resetPresses);
      keys.forEach((key) => key.style.removeProperty("--matrix-light"));
      press.current = undefined;
    };
  }, [container, grid, effect, layerKey, extra]);
  return useCallback(
    (key: number, down: boolean) => press.current?.(key, down),
    [],
  );
}
