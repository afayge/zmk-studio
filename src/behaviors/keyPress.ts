import aliases from "./zmk-keycodes.json";
import {
  hid_usage_get_label,
  hid_usage_get_labels,
  hid_usage_page_get_ids,
} from "../hid-usages";
import { keyboardGroup, consumerGroup } from "./actionGroups";
import { compactLegends, stackedLegends } from "./keyPaletteLayout";

export const keyIndex: Partial<Record<number, string[]>> = aliases;
export const hexCode = (value: number) =>
  "0x" + (value >>> 0).toString(16).toUpperCase().padStart(8, "0");
const hidNames = new Map<number, string>();
for (const page of [7, 12]) {
  for (const usage of hid_usage_page_get_ids(page)?.UsageIds ?? []) {
    hidNames.set(
      (page << 16) | usage.Id,
      page === 7
        ? (hid_usage_get_label(page, usage.Id) ?? usage.Name).replace(
            /^Keyboard /,
            "",
          )
        : usage.Name,
    );
  }
}
export const keyCodes = [
  ...new Set([...hidNames.keys(), ...Object.keys(aliases).map(Number)]),
];
export const modifierNames = [
  "Left Ctrl",
  "Left Shift",
  "Left Alt",
  "Left GUI",
  "Right Ctrl",
  "Right Shift",
  "Right Alt",
  "Right GUI",
];
export function keyModifiers(code: number, compact = false) {
  return (
    compact ? ["⌃", "⇧", "⌥", "◆", "R⌃", "R⇧", "R⌥", "R◆"] : modifierNames
  ).filter((_, i) => (code >>> 24) & (1 << i));
}
export function keyName(code: number, fullName = false) {
  const base = code & 0xffffff,
    id = code & 0xffff,
    page = base >>> 16;
  let name = hidNames.get(base) ?? keyIndex[base]?.[0].split(" ")[0];
  if (fullName && page === 7) {
    const labels = hid_usage_get_labels(page, id);
    name = labels.long ?? labels.med ?? name;
  }
  if (page === 7) {
    if (id >= 0xe0 && id <= 0xe7) name = modifierNames[id - 0xe0];
    else if (id >= 0x59 && id <= 0x62) name = "Keypad " + compactLegends[id];
  }
  if (!name) return hexCode(code);
  const symbol = page === 7 && code >>> 24 === 2 && stackedLegends[id]?.[0];
  const primary = keyIndex[base]?.[0].split(" ")[0];
  // Firmware distinguishes keyboard and consumer variants of commands such as mute.
  if (primary && name !== primary && /^[KC]_/.test(primary))
    name += " · " + primary;
  const combined = [...keyModifiers(code), name].join(" + ");
  return symbol ? symbol + " (" + combined + ")" : combined;
}
export function keyGroup(code: number) {
  const official = keyIndex[code]?.[1] ?? keyIndex[code & 0xffffff]?.[1] ?? "";
  if (official.includes("Input Assist")) return "Input assist";
  if (official.includes("Power & Lock")) return "Power & lock";
  if (official.includes("Editing")) return "Editing";
  if (official.includes("Applications") && ((code >>> 16) & 255) === 7)
    return "Application commands";
  return ((code >>> 16) & 255) === 7
    ? keyboardGroup(code & 0xffff)
    : consumerGroup(code & 0xffff);
}
export function keyLegend(code: number) {
  const id = code & 0xffff;
  if (((code >>> 16) & 255) !== 7) return;
  const symbol = stackedLegends[id];
  if (symbol && code >>> 24 === 2) return symbol[0];
  const base =
    compactLegends[id] ?? symbol?.[1] ?? hidNames.get(code & 0xffffff);
  if (!base) return;
  return [...keyModifiers(code, true), base].join("");
}
