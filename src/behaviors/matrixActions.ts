import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { Catalog } from "../rpc/generated/lighting";
import type { DeviceBehavior } from "./actions";
import type { IconName } from "./ActionIcon";
import { validateValue } from "./parameters";

type Parameter =
  | "brightness"
  | "preset"
  | "status"
  | "speed"
  | "hue"
  | "zone"
  | "zonePreset";
type Command = {
  macro: string;
  label: string;
  icon: IconName;
  mark?: string;
  parameter?: Parameter;
};
// Indexed by the command IDs in dt-bindings/zmk/led_matrix.h.
export const matrixCommands: readonly Command[] = [
  { macro: "LM_ON", label: "Turn On", icon: "lightOn" },
  { macro: "LM_OFF", label: "Turn Off", icon: "lightOff" },
  { macro: "LM_TOG", label: "Toggle", icon: "lightPower" },
  { macro: "LM_BRI", label: "Brightness Up", icon: "brighter" },
  { macro: "LM_BRD", label: "Brightness Down", icon: "dimmer" },
  { macro: "LM_EFF", label: "Profile Next", icon: "effectNext" },
  { macro: "LM_EFR", label: "Profile Previous", icon: "effectPrevious" },
  {
    macro: "LM_EFS",
    label: "Set Profile",
    icon: "effects",
    parameter: "preset",
  },
  {
    macro: "LM_BRT",
    label: "Set Brightness",
    icon: "sun",
    parameter: "brightness",
  },
  {
    macro: "LM_STA",
    label: "Show Status",
    icon: "indicators",
    parameter: "status",
  },
  { macro: "LM_SPI", label: "Speed Up", icon: "speed", mark: "+" },
  { macro: "LM_SPD", label: "Speed Down", icon: "speed", mark: "−" },
  { macro: "LM_SPS", label: "Set Speed", icon: "speed", parameter: "speed" },
  { macro: "LM_HUI", label: "Hue Up", icon: "palette", mark: "+" },
  { macro: "LM_HUD", label: "Hue Down", icon: "palette", mark: "−" },
  {
    macro: "LM_HUS",
    label: "Set Palette Hue",
    icon: "palette",
    parameter: "hue",
  },
  {
    macro: "LM_CFF",
    label: "Zone Preset Next",
    icon: "zone",
    mark: "▶",
    parameter: "zone",
  },
  {
    macro: "LM_CFR",
    label: "Zone Preset Previous",
    icon: "zone",
    mark: "◀",
    parameter: "zone",
  },
  {
    macro: "LM_CFS",
    label: "Set Zone Preset",
    icon: "zone",
    parameter: "zonePreset",
  },
];
export const statusSources = ["Battery", "USB", "Bluetooth", "Lock keys"];
export const isMatrix = (name?: string) => name?.toLowerCase() === "led matrix";
export function matrixSets(behavior: DeviceBehavior, command: number) {
  return behavior.metadata.filter((s) =>
    s.param1.some((v) => v.constant === command),
  );
}
function parameterName(
  behavior: DeviceBehavior,
  command: number,
  value: number,
) {
  for (const set of matrixSets(behavior, command)) {
    const name = set.param2.find((v) => v.constant === value)?.name;
    if (name) return name;
  }
}

export function matrixChoices(
  behavior: DeviceBehavior,
  command: number,
  catalog?: Catalog,
) {
  const sets = matrixSets(behavior, command);
  const parameter = matrixCommands[command]?.parameter;
  const options = new Map<number, string>();
  const add = (value: number, name: string) => {
    if (sets.some((s) => validateValue([], value, s.param2)))
      options.set(value, name);
  };
  if (catalog && parameter === "preset")
    for (const p of catalog.profiles) add(p.id, p.name || `Preset ${p.id + 1}`);
  else if (catalog && (parameter === "zone" || parameter === "zonePreset")) {
    for (const z of catalog.zones) {
      if (parameter === "zone") add(z.id, z.name || `Zone ${z.id + 1}`);
      else
        for (const p of z.profiles)
          add((z.id << 8) | p.id, p.name || `Preset ${p.id + 1}`);
    }
  } else {
    for (const s of sets) {
      if (!s.param2.length) add(0, "0");
      for (const v of s.param2) {
        if (v.nil) add(0, "0");
        else if (v.constant !== undefined)
          add(v.constant, v.name || String(v.constant));
        else if (v.range)
          for (
            let n = v.range.min;
            n <=
            Math.min(v.range.max, parameter === "zonePreset" ? 65535 : 255);
            n++
          )
            add(n, String(n));
      }
    }
  }
  return options;
}
export function matrixAvailable(command: number, catalog?: Catalog) {
  if (!catalog) return true;
  if (command >= 5 && command <= 7) return catalog.profiles.length > 0;
  if (command >= 16 && command <= 18) return catalog.zones.length > 0;
  return true;
}
export function matrixParameterText(
  b: BehaviorBinding,
  behavior: DeviceBehavior,
  catalog?: Catalog,
) {
  const cmd = matrixCommands[b.param1],
    n = b.param2;
  if (!cmd) return String(n);
  let detail = "";
  switch (cmd.parameter) {
    case "brightness":
      detail = n + "%";
      break;
    case "status":
      detail =
        n === 0
          ? "All"
          : statusSources.filter((_, i) => n & (1 << i)).join(" + ");
      break;
    case "zonePreset": {
      const z = catalog?.zones.find((z) => z.id === n >>> 8),
        p = z?.profiles.find((p) => p.id === (n & 255));
      const named = parameterName(behavior, b.param1, n);
      detail = `${z?.name || "Zone " + ((n >>> 8) + 1)} · ${p?.name || named || "Preset " + ((n & 255) + 1)}`;
      break;
    }
    case "zone":
      detail =
        catalog?.zones.find((z) => z.id === n)?.name ||
        parameterName(behavior, b.param1, n) ||
        `Zone ${n + 1}`;
      break;
    case "preset":
      detail =
        catalog?.profiles.find((p) => p.id === n)?.name ||
        parameterName(behavior, b.param1, n) ||
        `Preset ${n + 1}`;
      break;
    case "speed":
    case "hue":
      detail = String(n);
      break;
  }
  return detail;
}

export function matrixSummary(
  b: BehaviorBinding,
  behavior: DeviceBehavior,
  catalog?: Catalog,
) {
  const command = matrixCommands[b.param1]?.label ?? `Command ${b.param1}`;
  return [
    behavior.displayName,
    command,
    matrixParameterText(b, behavior, catalog),
  ]
    .filter(Boolean)
    .join(" · ");
}
