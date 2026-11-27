import type { GetBehaviorDetailsResponse } from "../rpc/generated/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { keyCodes, keyName as usageName, keyGroup, keyIndex } from "./keyPress";
import {
  isMatrix,
  matrixCommands,
  matrixAvailable,
  matrixChoices,
  matrixSummary,
} from "./matrixActions";
import type { Catalog } from "../rpc/generated/lighting";
import { compareGroups, groupKeywords, layerGroup } from "./actionGroups";
import { paletteUsages, stackedLegends } from "./keyPaletteLayout";
import { isLighting, lightingCommand } from "./bindingIcons";
import { actionGlyph, type ActionGlyph } from "./actionGlyph";
import { validateValue } from "./parameters";

import {
  identity,
  commandAlias,
  firstValue,
  packAxes,
  valueName,
} from "./official";

export const categories = [
  "Basic keys",
  "Media",
  "Mouse",
  "Device",
  "Special keys",
  "Lighting",
  "Macros",
  "Shortcuts",
  "Layers",
  "Tap / hold",
  "All behaviors",
] as const;
export type Category = (typeof categories)[number];
export type DeviceBehavior = GetBehaviorDetailsResponse;
type NamedLayer = { id: number; name: string };
export interface Action {
  label: string;
  keywords: string;
  category: Category;
  group: string;
  binding: BehaviorBinding;
  edit?: boolean;
  glyph: ActionGlyph;
}

export const sameBinding = (a: BehaviorBinding, b: BehaviorBinding) =>
  a.behaviorId === b.behaviorId &&
  a.param1 === b.param1 &&
  a.param2 === b.param2;

export function accepts(
  behavior: DeviceBehavior,
  ids: number[],
  binding: BehaviorBinding,
) {
  if (behavior.bindingType?.sensorOnly) return false;
  if (
    !behavior.metadata.length &&
    ["mmv", "msc"].includes(identity(behavior).label ?? "")
  )
    return false;
  if (!behavior.metadata.length)
    return binding.param1 === 0 && binding.param2 === 0;
  return behavior.metadata.some(
    (set) =>
      validateValue(ids, binding.param1, set.param1) &&
      validateValue(ids, binding.param2, set.param2),
  );
}

export function describe(
  binding: BehaviorBinding,
  behavior?: DeviceBehavior,
  layers: NamedLayer[] = [],
  catalog?: Catalog,
) {
  const name = identity(behavior).name;
  const layer =
    layers.find((l) => l.id === binding.param1)?.name || String(binding.param1);
  if (name === "Key Press") return usageName(binding.param1);
  if (behavior && isMatrix(name))
    return matrixSummary(binding, behavior, catalog);
  if (behavior && isLighting(name)) {
    const command = lightingCommand(behavior, binding);
    if (command) {
      const set = behavior.metadata.find((s) =>
        s.param1.some((v) => v.constant === binding.param1),
      );
      return [
        behavior.displayName,
        command,
        ...(set?.param2.some((v) => !v.nil)
          ? [valueName(binding.param2, set.param2, layers)]
          : []),
      ].join(" · ");
    }
  }
  if (/^mod[ -]?tap$/i.test(name || ""))
    return `Tap ${usageName(binding.param2)}, hold ${usageName(binding.param1)}`;
  if (/^layer[ -]?tap$/i.test(name || ""))
    return `Tap ${usageName(binding.param2)}, hold for ${layer}`;

  if (behavior) {
    const set = behavior.metadata.find((s) =>
      validateValue(
        layers.map((l) => l.id),
        binding.param1,
        s.param1,
      ),
    );
    if (set)
      return [
        behavior.displayName,
        ...(set.param1.length
          ? [valueName(binding.param1, set.param1, layers)]
          : []),
        ...(set.param2.length
          ? [valueName(binding.param2, set.param2, layers)]
          : []),
      ].join(" · ");
  }
  return [
    behavior?.displayName || `Behavior ${binding.behaviorId}`,
    ...(binding.param1 ||
    binding.param2 ||
    !behavior ||
    identity(behavior).icon === "command"
      ? [binding.param1, binding.param2]
      : []),
  ].join(" · ");
}

const mediaAliases: Record<number, string> = {
  226: "静音 mute",
  233: "提高音量 volume up",
  234: "降低音量 volume down",
  205: "播放 暂停 play pause",
  181: "下一首 next track",
  182: "上一首 previous track",
  111: "调亮 brightness up",
  112: "调暗 brightness down",
};

export function listActions(
  behaviors: DeviceBehavior[],
  layers: NamedLayer[],
  catalog?: Catalog,
) {
  const actions: Action[] = [];
  const ids = layers.map((l) => l.id);
  for (const behavior of behaviors) {
    if (
      behavior.bindingType?.sensorOnly ||
      (!behavior.bindingType && behavior.displayName === "enc_key_press")
    )
      continue;
    if (
      !behavior.metadata.length &&
      ["mmv", "msc"].includes(identity(behavior).label ?? "")
    )
      continue;
    const { id: behaviorId, displayName } = behavior;
    const identityInfo = identity(behavior);
    const kind = identityInfo.name;
    const add = (
      category: Category,
      group: string,
      label: string,
      keywords: string,
      param1 = 0,
      param2 = 0,
      edit = false,
    ) => {
      const binding = { behaviorId, param1, param2 };
      if (edit || accepts(behavior, ids, binding)) {
        const action = {
          category,
          group,
          label,
          keywords: keywords + " " + identityInfo.aliases,
          binding,
          edit,
        };
        actions.push({ ...action, glyph: actionGlyph(action, behavior) });
      }
    };
    const modTap = /^mod[ -]?tap$/i.test(kind);
    const layerTap = /^layer[ -]?tap$/i.test(kind);
    const selectsLayer =
      behavior.metadata.some((s) => s.param1.some((v) => v.layerId)) &&
      !behavior.metadata.some((s) => s.param2.length);
    let behaviorGroup = "Other behaviors";
    if (modTap || layerTap) behaviorGroup = "Tap / hold behaviors";
    else if (selectsLayer) behaviorGroup = "Layer controls";
    else if (
      kind === "Macro" ||
      /(?:^|[^a-z])macro(?:s)?(?=$|[^a-z])/i.test(
        displayName.replace(/([a-z])([A-Z])/g, "$1 $2"),
      )
    )
      behaviorGroup = "Macros";
    else if (
      [
        "Key Press",
        "Sticky Key",
        "Key Toggle",
        "Key Repeat",
        "Transparent",
        "None",
        "Grave/Escape",
      ].includes(kind)
    )
      behaviorGroup = "Key output";
    else if (
      [
        "Bluetooth",
        "External Power",
        "Output Selection",
        "Bootloader",
        "Reset",
        "Studio Unlock",
        "LED Matrix",
        "RGB Underglow",
        "Backlight",
      ].includes(kind)
    )
      behaviorGroup = "Device controls";
    add(
      "All behaviors",
      behaviorGroup,
      displayName,
      "behavior 自定义 " +
        displayName +
        (behaviorGroup === "Macros" ? " 宏" : ""),
      0,
      0,
      behavior.metadata.some(
        (s) => s.param1.some((v) => !v.nil) || s.param2.some((v) => !v.nil),
      ),
    );
    if (kind === "Key Press") {
      for (const code of keyCodes) {
        const page = (code >>> 16) & 255,
          id = code & 0xffff;
        if ((page !== 7 && page !== 12) || (page === 7 && id < 4)) continue;
        const category =
          page === 12
            ? "Media"
            : !(code >>> 24) && paletteUsages.has(id)
              ? "Basic keys"
              : "Special keys";
        const symbols =
          page === 7 ? stackedLegends[id]?.join(" ") : mediaAliases[id];
        add(
          category,
          keyGroup(code),
          usageName(code),
          [...(keyIndex[code] ?? []), symbols].filter(Boolean).join(" "),
          code,
        );
      }
      for (const [label, key, mods, alias] of [
        ["Copy", 6, 1, "复制"],
        ["Paste", 25, 1, "粘贴"],
        ["Undo", 29, 1, "撤销"],
        ["Copy", 6, 8, "复制 Mac"],
        ["Paste", 25, 8, "粘贴 Mac"],
      ] as const) {
        const code = (mods << 24) | 0x70000 | key;
        add(
          "Shortcuts",
          mods === 8 ? "GUI / Command shortcuts" : "Ctrl shortcuts",
          label + " · " + usageName(code),
          alias,
          code,
        );
      }
    } else if (isLighting(kind)) {
      const commands = new Map(
        behavior.metadata
          .flatMap((set) => set.param1)
          .filter((v) => v.constant !== undefined)
          .map((v) => [v.constant!, v.name]),
      );
      if (!commands.size)
        add("Lighting", displayName, displayName, "灯效", 0, 0, true);
      for (const [command, label] of commands) {
        if (isMatrix(kind) && matrixCommands[command]) {
          if (!matrixAvailable(command, catalog)) continue;
          const cmd = matrixCommands[command],
            choices = matrixChoices(behavior, command, catalog);
          if (!choices.size) continue;
          add(
            "Lighting",
            displayName,
            cmd.label,
            [cmd.macro, label, "灯效 灯光矩阵 LED Matrix"].join(" "),
            command,
            choices.keys().next().value ?? 0,
            !!cmd.parameter,
          );
          continue;
        }
        const binding = { behaviorId, param1: command, param2: 0 };
        const needsParameter = behavior.metadata.some(
          (set) =>
            set.param1.some((v) => v.constant === command) &&
            set.param2.some((v) => !v.nil),
        );
        add(
          "Lighting",
          displayName,
          label,
          commandAlias(identityInfo.label, command) + " 灯效 " + displayName,
          command,
          0,
          needsParameter || !accepts(behavior, ids, binding),
        );
      }
    } else if (
      ["bt", "out", "ext_power", "mkp"].includes(identityInfo.label ?? "")
    ) {
      const mouse = identityInfo.label === "mkp";
      for (const set of behavior.metadata) {
        for (const v of set.param1) {
          if (v.constant === undefined) continue;
          const key = commandAlias(identityInfo.label, v.constant);
          const mouseAlias = mouse
            ? { 1: "LCLK", 2: "RCLK", 4: "MCLK" }[v.constant] ?? ""
            : "";
          add(
            mouse ? "Mouse" : "Device",
            displayName,
            v.name || key,
            key + " " + mouseAlias,
            v.constant,
            firstValue(set.param2, ids),
            set.param2.some((v) => !v.nil),
          );
        }
      }
    } else if (identityInfo.label === "mmv" || identityInfo.label === "msc") {
      const scroll = identityInfo.label === "msc",
        n = scroll ? 10 : 600;
      if (behavior.metadata.some((s) => s.param1.some((v) => v.signedAxes))) {
        for (const [dir, x, y] of [
          ["Left", -n, 0],
          ["Right", n, 0],
          ["Up", 0, scroll ? n : -n],
          ["Down", 0, scroll ? -n : n],
        ] as const)
          add(
            "Mouse",
            kind,
            (scroll ? "Scroll " : "Move ") + dir,
            (scroll ? "SCRL_" : "MOVE_") + dir.toUpperCase(),
            packAxes(x, y),
            0,
            true,
          );
      }
    } else if (behaviorGroup === "Macros") {
      add(
        "Macros",
        "Macros",
        displayName,
        "宏",
        0,
        0,
        behavior.metadata.some((set) =>
          [...set.param1, ...set.param2].some((v) => !v.nil),
        ),
      );
    } else if (selectsLayer) {
      for (const [index, layer] of layers.entries()) {
        const momentary = kind === "Momentary Layer";
        add(
          "Layers",
          layerGroup(kind),
          (momentary ? "Hold for layer" : displayName) +
            " · " +
            (layer.name || String(index)),
          momentary ? "按住切层 momentary layer" : "切层 " + displayName,
          layer.id,
        );
      }
    } else if (modTap) {
      add(
        "Tap / hold",
        "Mod-Tap",
        "Tap Esc, hold Ctrl",
        "点按 长按 按住 逃逸 escape control mod tap",
        0x700e0,
        0x70029,
      );
      add(
        "Tap / hold",
        "Mod-Tap",
        "Custom mod-tap",
        "自定义 点按 长按",
        0,
        0,
        true,
      );
    } else if (layerTap) {
      add(
        "Tap / hold",
        "Layer-Tap",
        displayName,
        "点按 长按 按住切层",
        0,
        0,
        true,
      );
    } else {
      const params = behavior.metadata[0];
      const device = [
        "sys_reset",
        "bootloader",
        "soft_off",
        "studio_unlock",
      ].includes(identityInfo.label ?? "");
      add(
        device
          ? "Device"
          : ["Tap Dance", "Mod-Morph", "Hold-Tap"].includes(kind)
            ? "Tap / hold"
            : "Special keys",
        kind,
        displayName,
        kind,
        firstValue(params?.param1 ?? [], ids),
        firstValue(params?.param2 ?? [], ids),
        behavior.metadata.some((s) =>
          [...s.param1, ...s.param2].some((v) => !v.nil),
        ),
      );
    }
  }
  return actions;
}

export function groupedResults(
  actions: Action[],
  category: Category,
  query: string,
) {
  const buckets = new Map<Category, Map<string, Action[]>>();
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const action of actions) {
    if (terms.length) {
      const text = [
        action.category,
        action.label,
        action.keywords,
        groupKeywords(action.group),
      ]
        .join(" ")
        .toLowerCase();
      if (!terms.every((term) => text.includes(term))) continue;
    } else if (action.category !== category) continue;
    const groups = buckets.get(action.category) ?? new Map<string, Action[]>();
    const entries = groups.get(action.group) ?? [];
    entries.push(action);
    groups.set(action.group, entries);
    buckets.set(action.category, groups);
  }
  return categories.flatMap((category) =>
    Array.from(buckets.get(category) ?? [])
      .sort(([a], [b]) => compareGroups(a, b))
      .map(([group, entries]) => ({ category, group, entries })),
  );
}

export function commonActions(actions: Action[], commandKey: boolean) {
  const modifier = commandKey ? 0x08000000 : 0x01000000;
  const codes = [
    0xc00e2,
    0xc00e9,
    0xc00ea,
    0xc00cd,
    0xc00b6,
    0xc00b5,
    0xc006f,
    0xc0070,
    modifier + 0x70006,
    modifier + 0x70019,
  ];
  const byCode = new Map(
    actions
      .filter((a) => a.category === "Media" || a.category === "Shortcuts")
      .map((a) => [a.binding.param1, a]),
  );
  return codes.flatMap((code) => byCode.get(code) ?? []);
}
