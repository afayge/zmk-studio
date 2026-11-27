// Entry order determines the order of section headings within each tab.
const aliases: Record<string, string> = {
  Letters: "alphabet 字母",
  "Number row": "digits numbers 主键区 数字 数字行",
  "Punctuation & symbols": "标点 符号",
  "Space & editing": "空格 编辑",
  "Arrows & navigation": "方向 导航",
  "Function keys": "功能键 Fn",
  Modifiers: "修饰键",
  "Numeric keypad": "numpad 数字小键盘",
  "International input": "国际输入 语言",
  Editing: "编辑",
  "Input assist": "输入辅助",
  "Power & lock": "电源 锁定",
  "LED Matrix": "灯光矩阵 灯效 lm",
  "Other keys": "其他键",
  Volume: "audio 音量",
  Playback: "transport 播放控制",
  "Brightness & display": "亮度 显示",
  "Application launch": "应用启动",
  "Application commands": "应用命令",
  "Other device controls": "其他设备控制",
  "Ctrl shortcuts": "control 快捷键",
  "GUI / Command shortcuts": "cmd win super 快捷键",
  "Hold for layer": "momentary 按住切层",
  "Toggle layer": "切换层",
  "Switch to layer": "切换到层",
  "Sticky layer": "粘滞层",
  "Mod-Tap": "点按 长按 修饰键",
  "Layer-Tap": "点按 长按 切层",
  "Key output": "按键输出",
  "Layer controls": "层控制 切层",
  "Tap / hold behaviors": "点按 长按",
  Macros: "宏",
  "Device controls": "设备控制",
  "Other behaviors": "其他行为 自定义",
};

export function groupKeywords(group: string) {
  return (
    group +
    " " +
    (Object.prototype.hasOwnProperty.call(aliases, group) ? aliases[group] : "")
  );
}

const order = new Map(
  Object.keys(aliases).map((label, index) => [label, index]),
);
export function compareGroups(a: string, b: string) {
  return (
    (order.get(a) ?? order.size) - (order.get(b) ?? order.size) ||
    a.localeCompare(b)
  );
}

// USB keyboard/keypad usage IDs (usage page 0x07).
export function keyboardGroup(id: number) {
  if (id >= 0x04 && id <= 0x1d) return "Letters";
  if (id >= 0x1e && id <= 0x27) return "Number row";
  if ((id >= 0x2d && id <= 0x38) || id === 0x64) return "Punctuation & symbols";
  if ((id >= 0x28 && id <= 0x2c) || id === 0x4c || (id >= 0x79 && id <= 0x7e))
    return "Space & editing";
  if (id >= 0x49 && id <= 0x52) return "Arrows & navigation";
  if ((id >= 0x3a && id <= 0x45) || (id >= 0x68 && id <= 0x73))
    return "Function keys";
  if (id >= 0xe0 && id <= 0xe7) return "Modifiers";
  if (
    (id >= 0x53 && id <= 0x63) ||
    id === 0x67 ||
    id === 0x85 ||
    id === 0x86 ||
    (id >= 0xb0 && id <= 0xdd)
  )
    return "Numeric keypad";
  if (id >= 0x87 && id <= 0x98) return "International input";
  return "Other keys";
}

export function consumerGroup(id: number) {
  if ((id >= 0xe0 && id <= 0xea) || (id >= 0x150 && id <= 0x155))
    return "Volume";
  if ((id >= 0xb0 && id <= 0xce) || (id >= 0xf0 && id <= 0xf5))
    return "Playback";
  if (
    (id >= 0x60 && id <= 0x75) ||
    (id >= 0x79 && id <= 0x7f) ||
    (id >= 0x2d0 && id <= 0x2d4)
  )
    return "Brightness & display";
  if (id >= 0x180 && id < 0x200) return "Application launch";
  if (id >= 0x200 && id <= 0x2b0) return "Application commands";
  return "Other device controls";
}

export function layerGroup(name: string) {
  switch (name) {
    case "Momentary Layer":
      return "Hold for layer";
    case "Toggle Layer":
      return "Toggle layer";
    case "To Layer":
    case "Go To Layer":
      return "Switch to layer";
    case "Sticky Layer":
      return "Sticky layer";
    default:
      return name;
  }
}
