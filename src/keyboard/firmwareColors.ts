import { createContext } from "react";
import { palette, rainbow } from "../rpc/lightingEditor";

export const ManualPaletteHue = createContext(0);

export type FirmwareColor = { macro: string; name: string; value: number };

// Values and aliases from dt-bindings/zmk/led_matrix_colors.h. The first name
// for a value is its canonical readback label (the wire carries only a number).
export const firmwareColorGroups: { name: string; colors: FirmwareColor[] }[] =
  [
    {
      name: "Dynamic",
      colors: [
        { macro: "LM_RAINBOW", name: "Dynamic rainbow", value: rainbow },
        { macro: "LM_PALETTE", name: "Manual palette", value: palette },
      ],
    },
    {
      name: "Basic",
      colors: [
        { macro: "LM_BLACK", name: "Black", value: 0x000000 },
        { macro: "LM_WHITE", name: "White", value: 0xffffff },
        { macro: "LM_RED", name: "Red", value: 0xff0000 },
        { macro: "LM_GREEN", name: "Green", value: 0x00ff00 },
        { macro: "LM_BLUE", name: "Blue", value: 0x0000ff },
        { macro: "LM_YELLOW", name: "Yellow", value: 0xffff00 },
        { macro: "LM_CYAN", name: "Cyan", value: 0x00ffff },
        { macro: "LM_MAGENTA", name: "Magenta", value: 0xff00ff },
        { macro: "LM_ORANGE", name: "Orange", value: 0xff8000 },
        { macro: "LM_AMBER", name: "Amber", value: 0xffbf00 },
        { macro: "LM_PURPLE", name: "Purple", value: 0x800080 },
        { macro: "LM_PINK", name: "Pink", value: 0xff4080 },
      ],
    },
    {
      name: "Grayscale",
      colors: [
        { macro: "LM_GRAY_08", name: "Gray 08", value: 0x080808 },
        { macro: "LM_GRAY_10", name: "Gray 10", value: 0x101010 },
        { macro: "LM_GRAY_20", name: "Gray 20", value: 0x202020 },
        { macro: "LM_GRAY_40", name: "Gray 40", value: 0x404040 },
        { macro: "LM_GRAY_80", name: "Gray 80", value: 0x808080 },
      ],
    },
    {
      name: "Dim",
      colors: [
        { macro: "LM_DIM_WHITE", name: "Dim White", value: 0x101010 },
        { macro: "LM_DIM_RED", name: "Dim Red", value: 0x100000 },
        { macro: "LM_DIM_GREEN", name: "Dim Green", value: 0x001000 },
        { macro: "LM_DIM_BLUE", name: "Dim Blue", value: 0x000010 },
        { macro: "LM_DIM_YELLOW", name: "Dim Yellow", value: 0x101000 },
        { macro: "LM_DIM_CYAN", name: "Dim Cyan", value: 0x001010 },
        { macro: "LM_DIM_AMBER", name: "Dim Amber", value: 0x100c00 },
      ],
    },
    {
      name: "Base layer",
      colors: [
        { macro: "LM_BASE_OFF", name: "Base Off", value: 0x000000 },
        { macro: "LM_BASE_IDLE", name: "Base Idle", value: 0x101010 },
        { macro: "LM_BASE_SOFT", name: "Base Soft", value: 0x202020 },
      ],
    },
    {
      name: "USB",
      colors: [
        { macro: "LM_USB_HID", name: "USB HID", value: 0x00ff00 },
        { macro: "LM_USB_POWERED", name: "USB Powered", value: 0x101010 },
        { macro: "LM_USB_NONE", name: "USB None", value: 0x000000 },
      ],
    },
    {
      name: "Bluetooth",
      colors: [
        { macro: "LM_BLE_OPEN", name: "Bluetooth Open", value: 0x0000ff },
        {
          macro: "LM_BLE_CONNECTED",
          name: "Bluetooth Connected",
          value: 0x00ffff,
        },
        {
          macro: "LM_BLE_DISCONNECTED",
          name: "Bluetooth Disconnected",
          value: 0xff0000,
        },
      ],
    },
    {
      name: "Battery",
      colors: [
        { macro: "LM_BATTERY_ON", name: "Battery On", value: 0x00ff00 },
        { macro: "LM_BATTERY_OFF", name: "Battery Off", value: 0x000000 },
        { macro: "LM_BATTERY_LOW", name: "Battery Low", value: 0xff0000 },
        { macro: "LM_BATTERY_MID", name: "Battery Mid", value: 0xffff00 },
        { macro: "LM_BATTERY_HIGH", name: "Battery High", value: 0x00ff00 },
      ],
    },
    {
      name: "HID",
      colors: [
        { macro: "LM_HID_ON", name: "HID On", value: 0xffffff },
        { macro: "LM_HID_OFF", name: "HID Off", value: 0x000000 },
        { macro: "LM_HID_CAPS_ON", name: "HID Caps On", value: 0xffffff },
        { macro: "LM_HID_NUM_ON", name: "HID Num On", value: 0xffffff },
        { macro: "LM_HID_SCROLL_ON", name: "HID Scroll On", value: 0xffffff },
      ],
    },
  ];

export const firmwareColors = firmwareColorGroups.flatMap(
  (group) => group.colors,
);

export function hexColor(value: number) {
  return "#" + value.toString(16).padStart(6, "0");
}

export function colorBackground(value: number, hue: number) {
  if (value === rainbow)
    return "linear-gradient(110deg, #f43f5e, #facc15, #22c55e, #38bdf8, #8b5cf6)";
  if (value === palette) return `hsl(${hue} 100% 50%)`;
  return hexColor(value);
}

export function parseCustomRgb(input: string, format?: "HEX" | "RGB") {
  const text = input.trim();
  if (format !== "RGB" && /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) {
    const hex = text.replace(/^#/, "");
    return Number.parseInt(
      hex.length === 3 ? hex.replace(/./g, "$&$&") : hex,
      16,
    );
  } else if (
    format !== "HEX" &&
    /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(text)
  ) {
    const [r, g, b] = text.split(",").map(Number);
    if (Math.max(r, g, b) <= 255) return (r << 16) | (g << 8) | b;
  }
}
