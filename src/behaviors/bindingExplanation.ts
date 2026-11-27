import type { BehaviorBinding } from "../rpc/generated/keymap";
import type { Catalog } from "../rpc/generated/lighting";
import type { DeviceBehavior } from "./actions";
import { keyName } from "./keyPress";
import { matrixCommands, matrixParameterText } from "./matrixActions";
import { axes, commandAlias, identity, valueName } from "./official";
import { validateValue } from "./parameters";

const commandExplanations: Record<string, string> = {
  LM_ON: "Turn on the LED Matrix.",
  LM_OFF: "Turn off the LED Matrix.",
  LM_TOG: "Toggle the LED Matrix on or off.",
  LM_BRI: "Increase LED Matrix brightness.",
  LM_BRD: "Decrease LED Matrix brightness.",
  LM_EFF: "Select the next LED Matrix preset.",
  LM_EFR: "Select the previous LED Matrix preset.",
  LM_SPI: "Increase LED Matrix animation speed.",
  LM_SPD: "Decrease LED Matrix animation speed.",
  LM_HUI: "Increase LED Matrix palette hue.",
  LM_HUD: "Decrease LED Matrix palette hue.",
  BT_CLR: "Clear the pairing for the current Bluetooth profile.",
  BT_CLR_ALL: "Clear pairings for all Bluetooth profiles.",
  BT_NXT: "Select the next Bluetooth profile.",
  BT_PRV: "Select the previous Bluetooth profile.",
  OUT_TOG: "Switch between USB and Bluetooth output.",
  OUT_USB: "Send keypresses over USB.",
  OUT_BLE: "Send keypresses over Bluetooth.",
  OUT_NONE: "Disable keyboard output.",
  EP_OFF: "Turn off external power.",
  EP_ON: "Turn on external power.",
  EP_TOG: "Toggle external power.",
  BL_ON: "Turn on the backlight.",
  BL_OFF: "Turn off the backlight.",
  BL_TOG: "Toggle the backlight.",
  BL_INC: "Increase backlight brightness.",
  BL_DEC: "Decrease backlight brightness.",
  BL_CYCLE: "Cycle through backlight brightness levels.",
  RGB_ON: "Turn on RGB underglow.",
  RGB_OFF: "Turn off RGB underglow.",
  RGB_TOG: "Toggle RGB underglow.",
  RGB_HUI: "Increase RGB underglow hue.",
  RGB_HUD: "Decrease RGB underglow hue.",
  RGB_SAI: "Increase RGB underglow saturation.",
  RGB_SAD: "Decrease RGB underglow saturation.",
  RGB_BRI: "Increase RGB underglow brightness.",
  RGB_BRD: "Decrease RGB underglow brightness.",
  RGB_SPI: "Increase RGB underglow animation speed.",
  RGB_SPD: "Decrease RGB underglow animation speed.",
  RGB_EFF: "Select the next RGB underglow effect.",
  RGB_EFR: "Select the previous RGB underglow effect.",
};

export function bindingExplanation(
  binding: BehaviorBinding | undefined,
  behavior: DeviceBehavior | undefined,
  layers: { id: number; name: string }[],
  catalog?: Catalog,
): string {
  if (!binding) return "Binding information unavailable.";
  const { param1, param2 } = binding;
  const raw = () =>
    `${behavior?.displayName || `Behavior ${binding.behaviorId}`} (parameters ${param1}, ${param2}).`;
  if (!behavior) return raw();
  const { label, name } = identity(behavior);
  const layer = layers.find((l) => l.id === param1)?.name || `layer ${param1}`;
  switch (label) {
    case "kp":
      return `Send ${keyName(param1, true)}.`;
    case "mt":
      return `Tap for ${keyName(param2, true)}. Hold for ${keyName(param1, true)}.`;
    case "lt":
      return `Tap for ${keyName(param2, true)}. Hold to activate ${layer}.`;
    case "mo":
      return `Activate ${layer} while held.`;
    case "sl":
      return `Activate ${layer} for the next keypress.`;
    case "tog":
      return `Toggle ${layer} on or off.`;
    case "to":
      return `Switch to ${layer}.`;
    case "sk":
      return `Keep ${keyName(param1, true)} active for the next keypress.`;
    case "kt":
      return `Toggle the pressed state of ${keyName(param1, true)}.`;
    case "trans":
      return "Use this key’s binding on the next active layer below.";
    case "none":
      return "Ignore this keypress.";
    case "key_repeat":
      return "Repeat the last key sent.";
    case "caps_word":
      return "Toggle Caps Word to capitalize a word as you type.";
    case "gresc":
      return "Send Escape, or grave accent when Shift or GUI is held.";
    case "bootloader":
      return "Restart the keyboard in bootloader mode.";
    case "sys_reset":
      return "Restart the keyboard.";
    case "studio_unlock":
      return "Unlock the keyboard for editing in ZMK Studio.";
    case "soft_off":
      return "Power off the keyboard.";
    case "mmv":
    case "msc": {
      const [x, y] = axes(param1);
      return `${label === "mmv" ? "Move the pointer" : "Scroll"} with X ${x} and Y ${y}.`;
    }
    case "mkp": {
      const button = valueName(
        param1,
        behavior.metadata.flatMap((s) => s.param1),
        layers,
      );
      return `Press mouse button ${button}.`;
    }
    case "lm": {
      const detail = matrixParameterText(binding, behavior, catalog);
      switch (matrixCommands[param1]?.macro) {
        case "LM_BRT":
          return `Set LED Matrix brightness to ${detail}.`;
        case "LM_STA":
          return param2 === 0
            ? "Show all configured LED Matrix status indicators."
            : `Show LED Matrix status indicators for ${detail}.`;
        case "LM_EFS":
          return `Select LED Matrix preset ${detail}.`;
        case "LM_SPS":
          return `Set LED Matrix animation speed to ${detail}.`;
        case "LM_HUS":
          return `Set LED Matrix palette hue to ${detail}.`;
        case "LM_CFF":
          return `Select the next LED Matrix preset for ${detail}.`;
        case "LM_CFR":
          return `Select the previous LED Matrix preset for ${detail}.`;
        case "LM_CFS":
          return `Select the LED Matrix zone preset ${detail}.`;
      }
      return commandExplanations[matrixCommands[param1]?.macro] ?? raw();
    }
  }
  const command = commandAlias(label, param1);
  if (commandExplanations[command]) return commandExplanations[command];
  switch (command) {
    case "BT_SEL":
      return `Select Bluetooth profile ${param2}.`;
    case "BT_DISC":
      return `Disconnect Bluetooth profile ${param2}.`;
    case "BL_SET":
      return `Set backlight brightness to ${param2}%.`;
    case "RGB_EFS":
      return `Select RGB underglow effect ${param2}.`;
    case "RGB_COLOR_HSB":
      return `Set RGB underglow to hue ${param2 >>> 16}°, saturation ${(param2 >>> 8) & 255}%, and brightness ${param2 & 255}%.`;
  }
  if (label) return raw();
  const ids = layers.map((l) => l.id);
  const set = behavior.metadata.find(
    (s) =>
      validateValue(ids, param1, s.param1) &&
      validateValue(ids, param2, s.param2),
  );
  if (!set && (param1 || param2)) return raw();
  const argument = (
    n: number,
    domain: DeviceBehavior["metadata"][number]["param1"],
  ) => (domain.some((v) => !v.nil) ? valueName(n, domain, layers) : "");
  const first = argument(param1, set?.param1 ?? []);
  const second = argument(param2, set?.param2 ?? []);
  switch (name) {
    case "Macro": {
      const args = [first, second].filter(Boolean);
      return `Run the “${behavior.displayName}” macro${args.length ? " with " + args.join(", ") : ""}.`;
    }
    case "Tap Dance":
      return `Tap one or more times to select an action from “${behavior.displayName}”.`;
    case "Mod-Morph":
      return `Use “${behavior.displayName}” to select an action based on the held modifiers.`;
    case "Hold-Tap":
      return `Tap for the “${behavior.displayName}” tap action${second ? " with " + second : ""}. Hold for its hold action${first ? " with " + first : ""}.`;
    default:
      return raw();
  }
}
