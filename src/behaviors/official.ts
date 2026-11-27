import type {
  GetBehaviorDetailsResponse as Behavior,
  BehaviorParameterValueDescription as Value,
} from "../rpc/generated/behaviors";
import type { BehaviorBinding } from "../rpc/generated/keymap";
import type { IconName } from "./ActionIcon";
import { keyName } from "./keyPress";

const definitions = {
  kp: ["Key Press", "key_press", "keyboard"],
  mt: ["Mod-Tap", "", "modTap"],
  lt: ["Layer-Tap", "", "layerTap"],
  mo: ["Momentary Layer", "momentary_layer", "holdLayer"],
  to: ["To Layer", "to_layer", "switchLayer"],
  tog: ["Toggle Layer", "toggle_layer", "toggleLayer"],
  sl: ["Sticky Layer", "", "stickyLayer"],
  kt: ["Key Toggle", "key_toggle", "toggle"],
  sk: ["Sticky Key", "sticky_key", "pin"],
  gresc: ["Grave/Escape", "", "morph"],
  caps_word: ["Caps Word", "caps_word", "capsWord"],
  key_repeat: ["Key Repeat", "key_repeat", "repeat"],
  trans: ["Transparent", "transparent", "transparent"],
  none: ["None", "none", "none"],
  mkp: ["Mouse Key Press", "mouse_key_press", "mouse"],
  mmv: ["Mouse Move", "input_two_axis", "move"],
  msc: ["Mouse Scroll", "", "scroll"],
  sys_reset: ["Reset", "reset", "restart"],
  bootloader: ["Bootloader", "", "boot"],
  bt: ["Bluetooth", "bluetooth", "bluetooth"],
  out: ["Output Selection", "outputs", "output"],
  rgb_ug: ["RGB Underglow", "rgb_underglow", "palette"],
  bl: ["Backlight", "backlight", "sun"],
  ext_power: ["External Power", "ext_power", "lightPower"],
  soft_off: ["Soft Off", "soft_off", "sleep"],
  studio_unlock: ["Studio Unlock", "studio_unlock", "unlock"],
  lm: ["LED Matrix", "led_matrix", "indicators"],
} as const satisfies Record<string, readonly [string, string, IconName]>;
type Label = keyof typeof definitions;
const labels = Object.keys(definitions) as Label[];
const legacy: Record<string, Label> = {
  Underglow: "rgb_ug",
  mouse_move: "mmv",
  mouse_scroll: "msc",
  z_so_off: "soft_off",
  "Go To Layer": "to",
};
const custom: Record<string, readonly [string, IconName]> = {
  hold_tap: ["Hold-Tap", "modTap"],
  tap_dance: ["Tap Dance", "dance"],
  mod_morph: ["Mod-Morph", "morph"],
  macro: ["Macro", "macro"],
  macro_one_param: ["Macro", "macro"],
  macro_two_param: ["Macro", "macro"],
};
export function identity(b?: Behavior) {
  const names = b?.bindingType?.bindingLabel.trim().split(/\s+/) ?? [];
  const kind = b?.bindingType?.compatible.replace(/^zmk_behavior_/, "") ?? "";
  const display = b?.displayName ?? "";
  const legacyLabel =
    labels.find((l) => definitions[l][0] === display) ??
    (Object.prototype.hasOwnProperty.call(legacy, display)
      ? legacy[display]
      : undefined);
  const label = b?.bindingType
    ? labels.find((l) => names.includes(l)) ??
      labels.find((l) => kind && definitions[l][1] === kind)
    : legacyLabel;
  const instance = Object.prototype.hasOwnProperty.call(custom, kind)
    ? custom[kind]
    : undefined;
  const [name, icon] = label
    ? [definitions[label][0], definitions[label][2]]
    : instance ??
      (!kind && /\bmacro\b/i.test(display)
        ? ["Macro", "macro" as const]
        : [display, "command" as const]);
  return {
    label,
    name,
    icon,
    aliases: [...new Set([...(label ? [label] : []), ...names])]
      .filter(Boolean)
      .map((l) => "&" + l)
      .join(" "),
  };
}
const commandNames: Partial<Record<Label, string[]>> = {
  bt: "BT_CLR BT_NXT BT_PRV BT_SEL BT_CLR_ALL BT_DISC".split(" "),
  out: "OUT_TOG OUT_USB OUT_BLE OUT_NONE".split(" "),
  ext_power: ["EP_OFF", "EP_ON", "EP_TOG"],
  rgb_ug:
    "RGB_TOG RGB_ON RGB_OFF RGB_HUI RGB_HUD RGB_SAI RGB_SAD RGB_BRI RGB_BRD RGB_SPI RGB_SPD RGB_EFF RGB_EFR RGB_EFS RGB_COLOR_HSB".split(
      " ",
    ),
  bl: "BL_ON BL_OFF BL_TOG BL_INC BL_DEC BL_CYCLE BL_SET".split(" "),
};
export const commandAlias = (label: Label | undefined, id: number) =>
  label ? commandNames[label]?.[id] ?? "" : "";
export const axes = (code: number) => [code >> 16, (code << 16) >> 16];
export const packAxes = (x: number, y: number) =>
  ((x << 16) | (y & 0xffff)) >>> 0;
export function firstValue(values: Value[], layers: number[]) {
  const v = values[0];
  return (
    v?.constant ??
    v?.range?.min ??
    (v?.hidUsage ? 0x70004 : v?.layerId ? layers[0] ?? 0 : 0)
  );
}
export function valueName(
  n: number,
  values: Value[],
  layers: { id: number; name: string }[],
) {
  const choice = values.find((v) => v.constant === n);
  if (choice) return choice.name || String(n);
  if (values.some((v) => v.hidUsage)) return keyName(n);
  if (values.some((v) => v.layerId))
    return layers.find((l) => l.id === n)?.name ?? String(n);
  if (values.some((v) => v.signedAxes))
    return "X " + axes(n)[0] + " · Y " + axes(n)[1];
  if (values.some((v) => v.hsb))
    return (n >>> 16) + "° · " + ((n >>> 8) & 255) + "% · " + (n & 255) + "%";
  return String(n);
}
export function commandGlyph(b: Behavior, binding: BehaviorBinding) {
  const { icon, label } = identity(b),
    cmd = binding.param1;
  const macro = commandAlias(label, cmd);
  const marks: Record<string, string> = {
    BT_SEL: String(binding.param2),
    BT_DISC: "×" + binding.param2,
    BT_CLR: "×",
    BT_CLR_ALL: "×*",
    BT_NXT: "▶",
    BT_PRV: "◀",
    OUT_USB: "USB",
    OUT_BLE: "BLE",
    OUT_TOG: "⇄",
    OUT_NONE: "×",
    EP_ON: "On",
    EP_OFF: "Off",
    EP_TOG: "⇄",
    RGB_SAI: "S+",
    RGB_SAD: "S−",
    RGB_HUI: "H+",
    RGB_HUD: "H−",
    RGB_SPI: "+",
    RGB_SPD: "−",
    RGB_COLOR_HSB: (binding.param2 >>> 16) + "°",
    RGB_EFS: String(binding.param2),
    BL_SET: binding.param2 + "%",
  };
  if (label === "mmv" || label === "msc") {
    const [x, y] = axes(cmd);
    return {
      icon,
      mark:
        (x < 0 ? "←" : x > 0 ? "→" : "") +
          (y === 0 ? "" : y < 0 === (label === "mmv") ? "↑" : "↓") || "0",
    };
  }
  if (macro === "RGB_SPI" || macro === "RGB_SPD")
    return { icon: "speed" as const, mark: marks[macro] };
  if (label === "mkp")
    return {
      icon,
      mark:
        b.metadata.flatMap((s) => s.param1).find((v) => v.constant === cmd)
          ?.name ?? String(cmd),
    };
  if (label === "caps_word") return { icon, mark: "ABC" };
  if (label === "gresc") return { icon, mark: "`/Esc" };
  return { icon, mark: marks[macro] };
}
