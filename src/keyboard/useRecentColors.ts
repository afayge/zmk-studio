import { useEffect, useRef, useState } from "react";
import { palette, rainbow } from "../rpc/lightingEditor";

const storageKey = "lighting-recent-colors";
const limit = 12;
let unsavedColors: number[] | undefined;

function readColors(): number[] {
  if (unsavedColors) return unsavedColors;
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? "[]",
    );
    if (!Array.isArray(stored)) return [];
    const valid = stored.filter(
      (value): value is number =>
        Number.isInteger(value) &&
        ((value >= 0 && value <= 0xffffff) ||
          value === palette ||
          value === rainbow),
    );
    return [...new Set(valid)].slice(0, limit);
  } catch {
    return [];
  }
}

export function useRecentColors() {
  const [recentColors, setRecentColors] = useState(readColors);
  const pointerDown = useRef(false);
  const pendingDisplay = useRef(false);
  useEffect(() => {
    let timer: number | undefined;
    const press = () => {
      pointerDown.current = true;
    };
    const release = () => {
      pointerDown.current = false;
      if (pendingDisplay.current) {
        pendingDisplay.current = false;
        // Let the click reach its original target before adding or moving swatches.
        timer = window.setTimeout(() => setRecentColors(readColors()), 0);
      }
    };
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null)
        setRecentColors(readColors());
    };
    window.addEventListener("storage", sync);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    // A tap can transfer focus on the synthetic mousedown after pointerup.
    window.addEventListener("mousedown", press, true);
    window.addEventListener("mouseup", release, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("mousedown", press, true);
      window.removeEventListener("mouseup", release, true);
      window.removeEventListener("blur", release);
      window.clearTimeout(timer);
    };
  }, []);

  function recordColor(color: number) {
    const existing = readColors();
    if (existing[0] === color) {
      setRecentColors(existing);
      return;
    }
    const next = [color, ...existing.filter((item) => item !== color)].slice(
      0,
      limit,
    );
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      unsavedColors = undefined;
    } catch {
      unsavedColors = next;
    }
    if (pointerDown.current) pendingDisplay.current = true;
    else setRecentColors(next);
  }
  return { recentColors, recordColor };
}
