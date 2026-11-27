import { identity, commandGlyph } from "./official";
import {
  hexCode,
  keyGroup,
  keyLegend,
  keyModifiers,
  keyName,
} from "./keyPress";
import { isMatrix, matrixCommands, statusSources } from "./matrixActions";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { IconName } from "./ActionIcon";
import type { Action, DeviceBehavior } from "./actions";
import { bindingIcon } from "./bindingIcons";

export interface ActionGlyph {
  icon: IconName;
  mark?: string;
}

const mediaGroupIcons = new Map<string, IconName>([
  ["Application launch", "launch"],
  ["Application commands", "command"],
  ["Volume", "mixer"],
  ["Playback", "media"],
  ["Brightness & display", "screen"],
]);

// Legends for the extended numeric keypad usages (0xB0–0xDD, in HID order).
const extendedKeypad = [
  "00",
  "000",
  "1,000",
  "0.0",
  "¤",
  "¢",
  "[",
  "]",
  "{",
  "}",
  "Tab",
  "⌫",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "XOR",
  "^",
  "%",
  "<",
  ">",
  "&",
  "&&",
  "|",
  "||",
  ":",
  "#",
  "␣",
  "@",
  "!",
  "MS",
  "MR",
  "MC",
  "M+",
  "M−",
  "M×",
  "M÷",
  "±",
  "C",
  "CE",
  "BIN",
  "OCT",
  "DEC",
  "HEX",
];

function shortMark(label: string) {
  const words = label
    .replace(/^(?:AL |AC |Keyboard |Keypad )/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .match(/[\p{L}\p{N}]+/gu);
  if (!words?.length) return Array.from(label).slice(0, 3).join("");
  return (
    words.length === 1
      ? Array.from(words[0]).slice(0, 4).join("")
      : words
          .slice(0, 4)
          .map((word) => Array.from(word)[0])
          .join("")
  ).toUpperCase();
}

export function bindingGlyph(
  binding: BehaviorBinding,
  behavior?: DeviceBehavior,
  preview = true,
): ActionGlyph | undefined {
  if (isMatrix(identity(behavior).name)) {
    const cmd = matrixCommands[binding.param1];
    if (!cmd) return { icon: "light", mark: "?" };
    const n = binding.param2;
    let detail = cmd.mark;
    if (preview && cmd.parameter) {
      switch (cmd.parameter) {
        case "brightness":
          detail = n + "%";
          break;
        case "zonePreset":
          detail = `${(n >>> 8) + 1}·${(n & 255) + 1}`;
          break;
        case "zone":
          detail = (cmd.mark ?? "") + String(n + 1);
          break;
        case "preset":
          detail = String(n + 1);
          break;
        case "status":
          detail =
            n === 0 || n === 15
              ? "All"
              : statusSources
                  .filter((_, i) => n & (1 << i))
                  .map((s) => (s[0] === "B" && s === "Bluetooth" ? "BT" : s[0]))
                  .join("+");
          break;
        default:
          detail = String(n);
      }
    }
    return { icon: cmd.icon, mark: detail };
  }
  const icon = bindingIcon(binding, behavior);
  if (!behavior) return undefined;
  if (identity(behavior).name !== "Key Press") {
    const result = commandGlyph(behavior, binding);
    if (icon) result.icon = icon;
    if (behavior.metadata.some((s) => s.param1.some((v) => v.layerId)))
      result.mark = String(binding.param1);
    else if (
      ["Mod-Tap", "Layer-Tap", "Hold-Tap"].includes(identity(behavior).name)
    )
      result.mark = keyLegend(binding.param2) ?? String(binding.param2);
    else if (behavior.metadata.some((s) => s.param1.some((v) => v.hidUsage)))
      result.mark = keyLegend(binding.param1) ?? keyName(binding.param1);
    return result;
  }
  const code = binding.param1,
    label = keyName(code),
    group = keyGroup(code);
  const mods = keyModifiers(code, true).join("");
  if (icon) return { icon, mark: mods || undefined };
  const baseIcon = bindingIcon(
    { ...binding, param1: code & 0xffffff },
    behavior,
  );
  if (baseIcon) return { icon: baseIcon, mark: mods || undefined };
  if (label === hexCode(code)) return { icon: "keycap", mark: label };
  const id = code & 0xffff;
  if (group === "Input assist")
    return {
      icon: "inputAssist",
      mark:
        mods +
        shortMark(
          keyName(code & 0xffffff)
            .split(" · ")[0]
            .replace(/.*Input Assist /i, ""),
        ),
    };
  if (group === "Power & lock")
    return {
      icon: /lock/i.test(label) ? "lock" : "lightPower",
      mark: mods + shortMark(keyName(code & 0xffffff).split(" · ")[0]),
    };
  if (((code >>> 16) & 255) === 12)
    return {
      icon: mediaGroupIcons.get(group) ?? "mixer",
      mark: mods + shortMark(keyName(code & 0xffffff).split(" · ")[0]),
    };
  const legend = keyLegend(code) ?? label;
  let mark =
    extendedKeypad[id - 0xb0] ??
    (legend.length <= 7 ? legend : shortMark(keyName(code & 0xffffff)));
  if (id >= 0x87 && id <= 0x8f) mark = "INT" + (id - 0x86);
  if (id >= 0x90 && id <= 0x98) mark = "LANG" + (id - 0x8f);
  if (
    mods &&
    !mark.startsWith(mods) &&
    !(code >>> 24 === 2 && legend.length === 1)
  )
    mark = mods + mark;
  const groupIcon: IconName =
    group === "Numeric keypad"
      ? "keypad"
      : group === "International input"
        ? "language"
        : group === "Application commands"
          ? "command"
          : group === "Editing"
            ? "edit"
            : group === "Other keys"
              ? "special"
              : "keycap";
  return { icon: groupIcon, mark };
}

export function actionGlyph(
  action: Omit<Action, "glyph">,
  behavior: DeviceBehavior,
): ActionGlyph {
  const family = { icon: identity(behavior).icon };
  return action.category === "All behaviors"
    ? family
    : bindingGlyph(action.binding, behavior, false) ?? family;
}
