// Positions and sizes in key units on a US ANSI reference keyboard.
// This is a palette of HID outputs, independent of the connected physical layout.
export interface PaletteKey {
  usage: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const keys: PaletteKey[] = [];
type Slot = number | [usage: number, width: number, height?: number];

function row(y: number, x: number, slots: Slot[]) {
  for (const slot of slots) {
    const [usage, width, height = 1] =
      typeof slot === "number" ? [slot, 1] : slot;
    keys.push({ usage, x, y, width, height });
    x += width;
  }
}

const letters = (value: string) =>
  Array.from(value, (c) => 4 + c.charCodeAt(0) - 65);
row(0, 0, [41]);
row(0, 2, [58, 59, 60, 61]);
row(0, 6.5, [62, 63, 64, 65]);
row(0, 11, [66, 67, 68, 69]);
row(1, 0, [53, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 45, 46, [42, 2]]);
row(2, 0, [[43, 1.5], ...letters("QWERTYUIOP"), 47, 48, [49, 1.5]]);
row(3, 0, [[57, 1.75], ...letters("ASDFGHJKL"), 51, 52, [40, 2.25]]);
row(4, 0, [[225, 2.25], ...letters("ZXCVBNM"), 54, 55, 56, [229, 2.75]]);
row(5, 0, [
  [224, 1.25],
  [227, 1.25],
  [226, 1.25],
  [44, 6.25],
  [230, 1.25],
  [231, 1.25],
  [101, 1.25],
  [228, 1.25],
]);

row(0, 15.25, [70, 71, 72]);
row(1, 15.25, [73, 74, 75]);
row(2, 15.25, [76, 77, 78]);
row(4, 16.25, [82]);
row(5, 15.25, [80, 81, 79]);

row(1, 18.5, [83, 84, 85, 86]);
row(2, 18.5, [95, 96, 97, [87, 1, 2]]);
row(3, 18.5, [92, 93, 94]);
row(4, 18.5, [89, 90, 91, [88, 1, 2]]);
row(5, 18.5, [[98, 2], 99]);

export const paletteKeys = keys;
export const paletteUsages = new Set(keys.map((k) => k.usage));

export const stackedLegends: Record<number, [string, string]> = {
  30: ["!", "1"],
  31: ["@", "2"],
  32: ["#", "3"],
  33: ["$", "4"],
  34: ["%", "5"],
  35: ["^", "6"],
  36: ["&", "7"],
  37: ["*", "8"],
  38: ["(", "9"],
  39: [")", "0"],
  45: ["_", "-"],
  46: ["+", "="],
  47: ["{", "["],
  48: ["}", "]"],
  49: ["|", "\\"],
  50: ["~", "#"],
  100: ["|", "\\"],
  51: [":", ";"],
  52: ['"', "'"],
  53: ["~", "`"],
  54: ["<", ","],
  55: [">", "."],
  56: ["?", "/"],
};

export const compactLegends: Record<number, string> = {
  40: "Enter",
  42: "Backspace",
  44: "Space",
  57: "Caps",
  70: "PrtSc",
  71: "ScrLk",
  72: "Pause",
  83: "Num",
  84: "÷",
  85: "×",
  88: "Enter",
  89: "1",
  90: "2",
  91: "3",
  92: "4",
  93: "5",
  94: "6",
  95: "7",
  96: "8",
  97: "9",
  98: "0",
  99: ".",
  101: "Menu",
  224: "L Ctrl",
  225: "L Shift",
  226: "L Alt",
  227: "L GUI",
  228: "R Ctrl",
  229: "R Shift",
  230: "R Alt",
  231: "R GUI",
};
