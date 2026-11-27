import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "./logging";

export enum Kind {
  Main = 1,
  Zone,
  Layer,
  Indicator,
  Timing,
}
export enum Field {
  Name = 1,
  Renderer,
  Brightness,
  Period,
  Afterglow,
  Fade,
  Range,
  DisplayTime,
  Timeout,
  BatteryTime,
  UsbTime,
  BleTime,
  HidTime,
  PairHold,
  Primary = 16,
  Secondary,
  Tertiary,
  Members,
  GroupName,
  Disabled,
  Style,
  Direction,
}
export enum Op {
  Directory = 1,
  Group,
  Read,
  Begin,
  Append,
  Commit,
  Restore,
  Live,
  Show,
  FactoryGroup = 11,
  Error = 255,
}
export type Values = Record<number, string | number | number[]>;
export interface Group {
  revision: number;
  factoryRevision: number;
  renderers: number;
  leds: number[];
  values: Values;
}
export type LedTopology = {
  firstCustom: number;
  capacity: number;
  grid?: { rows: number; cols: number; defaultSpeed: number };
  leds: { position: number; owner: number; row?: number; col?: number }[];
};
export const unassigned = 0xffff;
export function withMembers(
  key: number,
  values: Values,
  members: number[],
): Values {
  const previous = values[Field.Members];
  if (!Array.isArray(previous)) return values;
  const next: Values = { ...values, [Field.Members]: members };
  for (const field of [Field.Primary, Field.Secondary, Field.Tertiary]) {
    const colors = values[field];
    if (key === Kind.Indicator << 16 && field === Field.Tertiary) continue;
    if (Array.isArray(colors) && colors.length > 1)
      next[field] = members.length
        ? members.map((id) => colors[previous.indexOf(id)] ?? colors[0])
        : [colors[0]];
  }
  return next;
}
export interface Directory {
  topology?: LedTopology;
  mainSlots?: { first: number; count: number };
  board: string;
  sources: number;
  groups: { key: number; label: string; profile: string }[];
}
export const rendererNames = [
  "Solid",
  "Breathe",
  "Spectrum",
  "Swirl",
  "Keypress",
  "Ripple",
  "Rain",
  "Starlight",
  "Gradient",
  "Wave",
  "Radial",
  "Rotary",
  "Particles",
  "Chase",
  "Reactive",
  "Heatmap",
];
export const effectStyles: Record<number, string[]> = {
  8: ["Horizontal", "Vertical", "Horizontal steps", "Vertical steps"],
  9: ["Horizontal", "Vertical", "Chevron", "Sea wave", "Brightness band"],
  10: ["Center", "Dual center", "Fountain"],
  11: ["Pinwheel", "Spiral", "Spiral band", "Dual beacon", "Rainbow beacon"],
  12: ["Twinkle", "Color drops", "Flower clusters"],
  14: [
    "Wide",
    "Cross",
    "Grid",
    "Piano columns",
    "Splash",
    "Color splash",
    "Lit ripple",
  ],
};
export const reversibleEffects = [8, 9, 10, 11, 13];
export const inherit = 0xffffffff,
  rainbow = 0x1000000,
  palette = 0x1000002;
export const view = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
export function words(...numbers: number[]) {
  const bytes = new Uint8Array(numbers.length * 4);
  numbers.forEach((x, i) => view(bytes).setUint32(i * 4, x, true));
  return bytes;
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
export function encodeValues(values: Values) {
  const output: number[] = [];
  for (const [key, v] of Object.entries(values)) {
    const b =
      typeof v === "string"
        ? encoder.encode(v)
        : Array.isArray(v)
          ? words(...v)
          : words(v);
    output.push(Number(key), b.length & 255, b.length >> 8, ...b);
  }
  return Uint8Array.from(output);
}
export function decodeValues(bytes: Uint8Array): Values {
  const values: Values = {};
  for (let i = 0; i < bytes.length; ) {
    const id = bytes[i],
      len = view(bytes).getUint16(i + 1, true);
    i += 3;
    if (i + len > bytes.length)
      throw Error("Incomplete lighting configuration.");
    const b = bytes.subarray(i, i + len);
    i += len;
    if (id === Field.Name || id === Field.GroupName)
      values[id] = decoder.decode(b);
    else if (id >= Field.Primary && id <= Field.Members && len % 4 === 0)
      values[id] = Array.from({ length: len / 4 }, (_, j) =>
        view(b).getUint32(4 * j, true),
      );
    else if (len === 4) values[id] = view(b).getUint32(0, true);
    else throw Error("Invalid lighting field.");
  }
  return values;
}
export function encodeDirectory(d: Directory) {
  const out = [
    d.topology?.grid ? 4 : d.mainSlots ? 3 : d.topology ? 2 : 1,
    d.sources,
  ];
  const str = (s: string) => {
    const b = encoder.encode(s);
    out.push(b.length, ...b);
  };
  str(d.board);
  if (d.topology) {
    const { firstCustom, capacity, leds } = d.topology;
    out.push(firstCustom, capacity);
    if (d.mainSlots) out.push(d.mainSlots.first, d.mainSlots.count);
    out.push(leds.length & 255, leds.length >> 8);
    const grid = d.topology.grid;
    if (grid)
      out.push(
        grid.rows & 255,
        grid.rows >> 8,
        grid.cols & 255,
        grid.cols >> 8,
        grid.defaultSpeed,
      );
    for (const {
      position,
      owner,
      row = unassigned,
      col = unassigned,
    } of leds) {
      out.push(position & 255, position >> 8, owner & 255, owner >> 8);
      if (grid) out.push(row & 255, row >> 8, col & 255, col >> 8);
    }
  }
  for (const g of d.groups) {
    out.push(...words(g.key));
    str(g.label);
    if (g.key >> 16 === Kind.Zone) str(g.profile);
  }
  return Uint8Array.from(out);
}
function directory(bytes: Uint8Array): Directory {
  let i = 2;
  const str = () => {
    const n = bytes[i++];
    if (n === undefined || i + n > bytes.length)
      throw Error("Invalid device directory.");
    const s = decoder.decode(bytes.subarray(i, i + n));
    i += n;
    return s;
  };
  if (![1, 2, 3, 4].includes(bytes[0]))
    throw Error("Unsupported lighting editor version.");
  const result: Directory = { board: str(), sources: bytes[1], groups: [] };
  if (bytes[0] >= 2) {
    const firstCustom = bytes[i++],
      capacity = bytes[i++];
    if (bytes[0] >= 3)
      result.mainSlots = { first: bytes[i++], count: bytes[i++] };
    const count = view(bytes).getUint16(i, true);
    i += 2;
    const grid =
      bytes[0] === 4
        ? {
            rows: view(bytes).getUint16(i, true),
            cols: view(bytes).getUint16(i + 2, true),
            defaultSpeed: bytes[i + 4],
          }
        : undefined;
    if (grid) i += 5;
    if (i + count * (grid ? 8 : 4) > bytes.length)
      throw Error("Incomplete LED topology.");
    const leds = Array.from({ length: count }, () => {
      const position = view(bytes).getUint16(i, true),
        owner = view(bytes).getUint16(i + 2, true);
      i += 4;
      if (grid) {
        const row = view(bytes).getUint16(i, true),
          col = view(bytes).getUint16(i + 2, true);
        i += 4;
        return { position, owner, row, col };
      }
      return { position, owner };
    });
    result.topology = { firstCustom, capacity, leds, ...(grid && { grid }) };
  }
  while (i < bytes.length) {
    const key = view(bytes).getUint32(i, true);
    i += 4;
    result.groups.push({
      key,
      label: str(),
      profile: key >> 16 === Kind.Zone ? str() : "",
    });
  }
  return result;
}
export function encodeGroup(g: Group) {
  const head = new Uint8Array(12 + 2 * g.leds.length),
    d = view(head);
  d.setUint32(0, g.revision, true);
  d.setUint32(4, g.factoryRevision, true);
  d.setUint16(8, g.renderers, true);
  d.setUint16(10, g.leds.length, true);
  g.leds.forEach((x, i) => d.setUint16(12 + i * 2, x, true));
  return Uint8Array.from([...head, ...encodeValues(g.values)]);
}
function group(bytes: Uint8Array): Group {
  const d = view(bytes),
    n = d.getUint16(10, true);
  const leds = Array.from({ length: n }, (_, i) =>
    d.getUint16(12 + i * 2, true),
  );
  const values = decodeValues(bytes.subarray(12 + n * 2));
  const members = values[Field.Members];
  if (
    members !== undefined &&
    (!Array.isArray(members) ||
      members.length !== n ||
      members.some((led, i) => led !== leds[i]))
  )
    throw Error("LED membership differs from the group readback.");
  return {
    revision: d.getUint32(0, true),
    factoryRevision: d.getUint32(4, true),
    renderers: d.getUint16(8, true),
    leds,
    values,
  };
}
const errors = [
  "",
  "The keyboard rejected a field value.",
  "Keyboard storage is full.",
  "This group changed on the keyboard. Read it again before applying.",
  "This side is offline or did not reply. Check its connection and firmware.",
  "Update this side’s firmware to edit lighting.",
  "The keyboard could not save the group.",
  "The transfer expired. Read the group again.",
  "This side is connecting. Retry when discovery is complete.",
];
const queues = new WeakMap<RpcConnection, Promise<unknown>>();
function serialize<T>(conn: RpcConnection, job: () => Promise<T>) {
  const result = (queues.get(conn) ?? Promise.resolve())
    .catch(() => {})
    .then(job);
  queues.set(conn, result);
  return result;
}
export function lightingEditor(conn: RpcConnection, side: number) {
  async function packet(
    op: Op,
    ticket: number,
    offset = 0,
    data = new Uint8Array(0),
  ) {
    const p = new Uint8Array(20),
      d = view(p);
    p[2] = op;
    p[3] = data.length;
    d.setUint16(4, offset, true);
    d.setUint16(6, ticket, true);
    p.set(data, 8);
    const result = (
      await call_rpc(conn, { lighting: { exchange: { side, packet: p } } })
    ).lighting?.exchange;
    const r = result?.packet;
    if (
      result?.side !== side ||
      !r ||
      r.length !== 20 ||
      view(r).getUint16(6, true) !== ticket ||
      r[3] > 12
    )
      throw Error("Incomplete reply from the selected side.");
    if (r[2] === Op.Error)
      throw Error(errors[r[8]] || "Lighting request failed.");
    if (r[2] !== op) throw Error("Unexpected lighting reply.");
    return { offset: view(r).getUint16(4, true), data: r.slice(8, 8 + r[3]) };
  }
  const ticket = () => crypto.getRandomValues(new Uint16Array(1))[0];
  async function read(op: Op, key: number, signal?: AbortSignal) {
    const id = ticket();
    signal?.throwIfAborted();
    const { offset: size } = await packet(
      op,
      id,
      0,
      op === Op.Directory ? words(key, 4) : words(key),
    );
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; ) {
      signal?.throwIfAborted();
      const { data, offset } = await packet(Op.Read, id, i);
      if (offset !== i || !data.length || data.length > size - i)
        throw Error("Incomplete lighting transfer.");
      bytes.set(data, i);
      i += data.length;
    }
    return bytes;
  }
  return {
    directory: (signal?: AbortSignal, layout = 0) =>
      serialize(conn, async () =>
        directory(await read(Op.Directory, layout, signal)),
      ),
    factoryGroup: (key: number) =>
      serialize(conn, async () => group(await read(Op.FactoryGroup, key))),
    group: (key: number, signal?: AbortSignal) =>
      serialize(conn, async () => group(await read(Op.Group, key, signal))),
    save: (key: number, revision: number, values?: Values) =>
      serialize(conn, async () => {
        const id = ticket(),
          target = words(key, revision);
        if (values) {
          const bytes = encodeValues(values);
          if (bytes.length > 65535)
            throw Error("Group exceeds the transfer limit.");
          await packet(Op.Begin, id, bytes.length, target);
          for (let i = 0; i < bytes.length; i += 12)
            await packet(Op.Append, id, i, bytes.slice(i, i + 12));
          await packet(Op.Commit, id);
        } else await packet(Op.Restore, id, 0, target);
        return group(await read(Op.Group, key));
      }),
    live: async () => {
      const { data } = await packet(Op.Live, ticket());
      if (data.length !== 10) throw Error("Missing lighting status.");
      return {
        source: data[0],
        mask: data[1],
        layerEffect: data[2],
        layer: data[3],
        battery: data[4],
        usb: data[5],
        bleProfile: data[6],
        ble: data[7],
        locks: data[8],
        reported: data[9],
      };
    },
    show: async (mask: number) => {
      await packet(Op.Show, ticket(), 0, Uint8Array.of(mask));
    },
  };
}
