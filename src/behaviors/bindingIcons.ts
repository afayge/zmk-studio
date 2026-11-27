import { identity } from "./official";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { DeviceBehavior } from "./actions";
import type { IconName } from "./ActionIcon";

const hidIcons = new Map<number, IconName>([
  [0x70028, "enter"],
  [0x7002a, "backspace"],
  [0x7002b, "tab"],
  [0x70049, "insert"],
  [0x7004a, "home"],
  [0x7004b, "pageUp"],
  [0x7004c, "deleteForward"],
  [0x7004d, "end"],
  [0x7004e, "pageDown"],
  [0x7004f, "arrowRight"],
  [0x70050, "arrowLeft"],
  [0x70051, "arrowDown"],
  [0x70052, "arrowUp"],
  [0x700e8, "playPause"],
  [0x700e9, "stop"],
  [0x700ea, "previous"],
  [0x700eb, "next"],
  [0x700ec, "eject"],
  [0x700ed, "volumeUp"],
  [0x700ee, "volumeDown"],
  [0x700ef, "mute"],
  [0xc00e2, "mute"],
  [0xc00e9, "volumeUp"],
  [0xc00ea, "volumeDown"],
  [0xc00b0, "play"],
  [0xc00b1, "pause"],
  [0xc00cd, "playPause"],
  [0xc00b2, "record"],
  [0xc00b3, "fastForward"],
  [0xc00b4, "rewind"],
  [0xc00b7, "stop"],
  [0xc00b8, "eject"],
  [0xc00b9, "shuffle"],
  [0xc00bc, "repeat"],
  [0xc021a, "undo"],
  [0xc021b, "copy"],
  [0xc021c, "cut"],
  [0xc021d, "paste"],
  [0xc021f, "search"],
  [0xc0221, "search"],
  [0x70066, "lightPower"],
  [0x70078, "stop"],
  [0x70079, "repeat"],
  [0x7007a, "undo"],
  [0x7007b, "cut"],
  [0x7007e, "search"],
  [0x0107001d, "undo"],
  [0xc00b5, "next"],
  [0xc00b6, "previous"],
  [0xc006f, "brighter"],
  [0xc0070, "dimmer"],
  [0x7007c, "copy"],
  [0x7007d, "paste"],
  [0x7007f, "mute"],
  [0x70080, "volumeUp"],
  [0x70081, "volumeDown"],
  [0x01070006, "copy"],
  [0x08070006, "copy"],
  [0x01070019, "paste"],
  [0x08070019, "paste"],
]);

export const isLighting = (name: string) =>
  /^(rgb underglow|backlight|led matrix)$/i.test(name);
export function lightingCommand(
  behavior: DeviceBehavior,
  binding: BehaviorBinding,
) {
  return behavior.metadata
    .flatMap((set) => set.param1)
    .find((v) => v.constant === binding.param1)?.name;
}

export function bindingIcon(
  binding: BehaviorBinding,
  behavior?: DeviceBehavior,
): IconName | undefined {
  if (identity(behavior).name === "Key Press")
    return hidIcons.get(binding.param1);
  if (!behavior || !isLighting(identity(behavior).name)) return;
  const name = lightingCommand(behavior, binding)?.toLowerCase();
  switch (name) {
    case "toggle on/off":
      return "lightPower";
    case "turn on":
      return "lightOn";
    case "turn off":
      return "lightOff";
    case "next effect":
    case "cycle brightness":
      return "effectNext";
    case "previous effect":
      return "effectPrevious";
    case "increase brightness":
    case "brightness up":
      return "brighter";
    case "decrease brightness":
    case "brightness down":
      return "dimmer";
  }
}
