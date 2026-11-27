// All glyphs share a 24-unit grid and inherit the key or navigation item's color.
const paths = {
  mouse: "M6 10a6 6 0 1 1 12 0v5a6 6 0 0 1-12 0Zm6-6v7m-6 0h12",
  move: "M12 2v20M2 12h20M9 5l3-3 3 3m-6 14 3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3",
  scroll:
    "M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0Zm4 1v6m7-10 2-2 2 2m-4 14 2 2 2-2",
  morph: "M3 6h6l6 12h6m-5-4 5 4-5 3M3 18h6l6-12h6m-5-4 5 4-5 3",
  dance: "M4 16h8l2 3H4Zm10-9h6l2 3h-8ZM5 7l2 4m2-8 1 6m4-7-1 5",
  capsWord: "M3 12l9-9 9 9h-5v4H8v-4Zm4 8h10",
  output: "M3 8h9v8H3Zm9 4h9m-5-5 5 5-5 5",
  restart: "M4 10a8 8 0 1 1 0 5M3 4v7h7",
  sleep: "M19 16A8 8 0 0 1 9 5a8 8 0 1 0 10 11Z",
  clockwise: "M4 15A8 8 0 1 1 19 9m-5 1h6V4",
  counterclockwise: "M20 15A8 8 0 1 0 5 9m5 1H4V4",
  keypad:
    "M5 2h14v20H5Zm3 4h8M8 10h1m3 0h1m3 0h.1M8 14h1m3 0h1m3 0h.1M8 18h5m3 0h.1",
  language:
    "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0Zm0 0h20M12 2c-6 5-6 15 0 20 6-5 6-15 0-20",
  insert: "M4 18h16M12 4v10m-5-5h10",
  home: "M4 5h16M6 18 17 8m-8 0h8v8",
  end: "M4 19h16M6 6l11 10m-8 0h8V8",
  pageUp: "M4 4h16M6 14l6-6 6 6m-12 6 6-6 6 6",
  pageDown: "M4 20h16M6 4l6 6 6-6m-12 6 6 6 6-6",
  deleteForward: "M3 5h12l7 7-7 7H3Zm4 4 6 6m0-6-6 6",
  effects: "M3 5h18v14H3ZM6 15l4-6 3 4 2-3 3 5",
  sun: "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0-5v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  indicators: "M2 8h20v9H2Zm4 4h1m4 0h2m4 0h1",
  speed: "M3 18a10 10 0 1 1 18 0ZM12 15l5-7M5 12l2 1m5-8v2",
  palette:
    "M12 3a9 9 0 1 0 0 18c3 0 4-2 2-4s0-3 2-3h2c5 0 3-11-6-11ZM7 10h1m2-4h1m4 1h1m2 3h1",
  zone: "M3 4h8v7H3Zm11 0h7v7h-7ZM3 14h8v7H3Zm11 0h7v7h-7Zm2 3h3",
  enter: "M20 5v9H4m5-5-5 5 5 5",
  backspace: "M9 5h12v14H9l-7-7Zm3 4 6 6m-6 0 6-6",
  arrowLeft: "M20 12H4m7-7-7 7 7 7",
  arrowRight: "M4 12h16m-7-7 7 7-7 7",
  arrowUp: "M12 20V4m-7 7 7-7 7 7",
  arrowDown: "M12 4v16m-7-7 7 7 7-7",
  tab: "M3 12h14m-6-6 6 6-6 6m10-14v16",
  lock: "M5 11h14v10H5Zm3-1V7a4 4 0 0 1 8 0v3m-4 4v3",
  inputAssist: "M3 5h18v10H3Zm3 4h2m3 0h2m3 0h2m-9 9 3 3 3-3",
  keyboard:
    "M4 6h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM6 10h.5m3.5 0h.5m3.5 0h.5m3.5 0h.5M6 14h.5m3.5 1h8",
  media:
    "M9 16V6l11-3v11M9 9l11-3M9 16c0 3-6 5-6 2 0-3 6-5 6-2Zm11-2c0 3-6 5-6 2s6-5 6-2Z",
  light: "M9 17c0-3-4-4-4-8a7 7 0 0 1 14 0c0 4-4 5-4 8ZM9 20h6m-5 2h4",
  special: "m12 2 2.7 6.9L22 12l-7.3 3.1L12 22l-2.7-6.9L2 12l7.3-3.1Z",
  macro: "M3 5h10m-10 5h7m-7 5h4m6-5 8 5-8 5Z",
  shortcut:
    "M6 9h12v6H6Zm0 0H5a3 3 0 1 1 3-3v3m8 0V6a3 3 0 1 1 3 3h-1M8 15v3a3 3 0 1 1-3-3h1m10 0v3a3 3 0 1 0 3-3h-1",
  layers: "m12 3 9 5-9 5-9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5",
  tap: "M7 11V6a3 3 0 0 1 6 0v7l2-1 4 2v4l-3 4h-5l-7-8a2 2 0 0 1 3-2l2 2M3 5a7 7 0 0 1 12-3",
  all: "M3 4h7v7H3Zm11 0h7v7h-7ZM3 15h7v6H3Zm11 0h7v6h-7Z",
  edit: "m4 16 12-12 4 4L8 20l-5 1Zm10-10 4 4",
  search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6",
  keycap:
    "M5 4h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 18h14",
  record: "M19 12a7 7 0 1 1-14 0 7 7 0 1 1 14 0Z",
  fastForward: "m2 5 9 7-9 7Zm10 0 9 7-9 7Z",
  rewind: "m22 5-9 7 9 7Zm-10 0-9 7 9 7Z",
  eject: "m4 15 8-10 8 10ZM4 19h16",
  repeat:
    "M3 11V9a3 3 0 0 1 3-3h13m-3-3 3 3-3 3M21 13v2a3 3 0 0 1-3 3H5m3 3-3-3 3-3",
  shuffle:
    "M3 6h3c4 0 7 12 12 12h3m-3-3 3 3-3 3M3 18h3c2 0 3-2 4-4m4-5c2-3 3-3 7-3m-3-3 3 3-3 3",
  undo: "M9 4 3 10l6 6m-5-6h10a6 6 0 0 1 6 6v3",
  cut: "m7 9 12 11M7 15 19 3M8 7a3 3 0 1 1-6 0 3 3 0 1 1 6 0Zm0 10a3 3 0 1 1-6 0 3 3 0 1 1 6 0Z",
  launch:
    "M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5m-8-1L21 3m-7 0h7v7",
  command:
    "M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 5 3 3-3 3m6 0h4",
  screen: "M3 4h18v13H3Zm9 13v3m-4 1h8",
  mixer: "M4 7h5m4 0h7M4 17h9m4 0h3M9 4v6m4 4v6",
  holdLayer: "M3 15l9 5 9-5M3 11l9 5 9-5M12 2v9m-4-4 4 4 4-4",
  toggleLayer:
    "m3 17 9 5 9-5M6 4h12a4 4 0 1 1 0 8H6a4 4 0 1 1 0-8Zm13 4a1 1 0 1 1-2 0 1 1 0 1 1 2 0Z",
  switchLayer: "m3 14 9 5 9-5M4 8h14m-5-5 5 5-5 5",
  stickyLayer: "m3 16 9 5 9-5M8 3h8l-2 4 2 3H8l2-3Zm4 7v5",
  layerTap: "m3 7 7-4 7 4-7 4Zm0 4 7 4m4 1 6 4m-7-7 1 8 3-3 4-1Z",
  modTap:
    "m3 10 4-5 4 5m-6 0v4h4v-4m5 4v-4a2 2 0 0 1 4 0v4l3 2v3l-2 3h-4l-4-6 1-1 2 1",
  pin: "m10 3 8 3-3 3-1 5 1 2-9-3 3-1 3-6Zm0 12-4 6",
  toggle:
    "M7 6h10a6 6 0 1 1 0 12H7A6 6 0 0 1 7 6Zm12 6a2 2 0 1 1-4 0 2 2 0 1 1 4 0Z",
  boot: "M7 7h10v10H7ZM10 3v4m4-4v4m-4 10v4m4-4v4M3 10h4m-4 4h4m10-4h4m-4 4h4",
  bluetooth: "M7 6l12 12-7 4V2l7 5L6 18",
  transparent: "M4 3h16v7m0 5v6H4v-6m0-5V7m8-1v12m-4-4 4 4 4-4",
  none: "M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0ZM6 18 18 6",
  unlock: "M7 11V8a5 5 0 0 1 9-3M5 11h14v10H5Zm7 4v2",
  mute: "M3 9h4l5-4v14l-5-4H3Zm13 0 6 6m0-6-6 6",
  volumeUp: "M3 9h4l5-4v14l-5-4H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  volumeDown: "M3 9h4l5-4v14l-5-4H3Zm13-1a6 6 0 0 1 0 8",
  previous: "M5 5v14m14-14L8 12l11 7Z",
  next: "M19 5v14M5 5l11 7-11 7Z",
  play: "m6 4 13 8-13 8Z",
  pause: "M7 5v14M17 5v14",
  playPause: "m3 5 10 7-10 7Zm13 0v14m5-14v14",
  stop: "M5 5h14v14H5Z",
  brighter:
    "M14 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-4-9v2m0 14v2m-9-9h2m1-6 1.5 1.5M4 18l1.5-1.5M16 6l-1.5 1.5M16 18l-1.5-1.5m2.5-4.5h5m-2.5-2.5v5",
  dimmer:
    "M14 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-4-9v2m0 14v2m-9-9h2m1-6 1.5 1.5M4 18l1.5-1.5M16 6l-1.5 1.5M16 18l-1.5-1.5m2.5-4.5h5",
  copy: "M8 8h11v13H8ZM5 16H3V3h12v2",
  paste: "M8 5H5v16h14V5h-3m-7-2h6v4H9Zm0 9h6m-6 4h5",
  lightOn:
    "M9 16c0-2-3-3-3-6a6 6 0 0 1 12 0c0 3-3 4-3 6Zm1 4h4M2 10h1m18 0h1M4 3l2 2m14-2-2 2",
  lightOff: "M6 8a6 6 0 0 0 2 7l1 2h6l1-2M10 4a6 6 0 0 1 8 7m-8 9h4M3 3l18 18",
  lightPower: "M12 2v9m-5-6a8 8 0 1 0 10 0",
  effectNext: "M4 11a8 8 0 0 1 14-4l2 2m0-5v5h-5M4 15h7m-5 4h5m4-5 6 4-6 4Z",
  effectPrevious:
    "M20 11A8 8 0 0 0 6 7L4 9m0-5v5h5m11 6h-7m5 4h-5m-4-5-6 4 6 4Z",
} as const;

export type IconName = keyof typeof paths;
export function ActionIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="action-icon"
      data-icon={name}
      viewBox="0 0 24 24"
      preserveAspectRatio={name === "keycap" ? "none" : undefined}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
