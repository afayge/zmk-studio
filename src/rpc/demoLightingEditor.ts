import type { Catalog, Exchange, State } from "./generated/lighting";
import {
  Kind,
  Field as F,
  Op,
  palette,
  rainbow,
  inherit,
  view,
  withMembers,
  unassigned,
  rendererNames,
  reversibleEffects,
  effectStyles,
  encodeDirectory,
  encodeGroup,
  decodeValues,
  type Directory,
  type Group,
  type Values,
} from "./lightingEditor";

function demoSide(right: boolean, catalog: Catalog, state: State) {
  const directory: Directory = {
    board: right ? "Demo right" : "Demo left",
    sources: right ? 5 : 15,
    groups: [],
    mainSlots: { first: 251, count: 4 },
    topology: {
      firstCustom: 1,
      capacity: 4,
      grid: { rows: right ? 0 : 2, cols: right ? 0 : 3, defaultSpeed: 4 },
      leds: (right
        ? [5, 7, 6, 15, unassigned, unassigned]
        : [0, 2, 1, 10, unassigned, unassigned, unassigned]
      ).map((position, led) => ({
        position,
        owner: unassigned,
        row: right || led >= 4 ? unassigned : led === 3 ? 1 : 0,
        col: right || led >= 4 ? unassigned : [0, 2, 1, 0][led],
      })),
    },
  };
  const groups = new Map<number, Group>();
  const defaults = new Map<number, Values>();
  const add = (
    kind: Kind,
    zone: number,
    id: number,
    label: string,
    leds: number[],
    values: Values,
    renderers = 0,
  ) => {
    const key = (kind << 16) | (zone << 8) | id;
    directory.groups.push({
      key,
      label,
      profile: kind === Kind.Zone ? String(values[F.Name]) : "",
    });
    if (kind !== Kind.Timing) values[F.Members] = [...leds];
    if (kind === Kind.Zone) {
      values[F.GroupName] = label;
      for (const led of leds) directory.topology!.leds[led].owner = zone;
    }
    groups.set(key, {
      revision: 1,
      factoryRevision: 1,
      values,
      renderers,
      leds,
    });
    defaults.set(key, structuredClone(values));
  };
  const profile = (name: string, renderer: number): Values => ({
    [F.Name]: name,
    [F.Renderer]: renderer,
    [F.Style]: 0,
    [F.Direction]: 0,
    [F.Brightness]: 80,
    [F.Period]: 1800,
    [F.Primary]: [palette],
  });
  const leds = directory.topology!.leds.map((_, id) => id);
  const mainRenderers = right ? 143 | (1 << 13) : 0xffff;
  for (const p of catalog.profiles) {
    const renderer = mainRenderers & (1 << p.id) ? p.id : 0;
    add(
      Kind.Main,
      0,
      p.id,
      p.name,
      leds,
      {
        ...profile(p.name, renderer),
        [F.Afterglow]: 150,
        [F.Fade]: 250,
        [F.Range]: 1,
      },
      mainRenderers,
    );
  }
  for (let id = 251; id < 255; id++) {
    add(
      Kind.Main,
      0,
      id,
      "New preset",
      leds,
      {
        ...profile("New preset", 0),
        [F.Primary]: [0xffffff],
        [F.Brightness]: 100,
        [F.Period]: 1000,
        [F.Afterglow]: 0,
        [F.Fade]: 0,
        [F.Range]: 0,
        [F.Disabled]: 1,
      },
      mainRenderers,
    );
  }
  if (right)
    add(
      Kind.Zone,
      0,
      0,
      "Thumb LEDs",
      [3, 4],
      profile("Thumb glow", 1),
      15 | (1 << 13),
    );
  else
    for (const p of catalog.zones[0].profiles)
      add(
        Kind.Zone,
        0,
        p.id,
        "Accent LEDs",
        [4, 5],
        { ...profile(p.name, p.id), [F.Primary]: [p.id === 0 ? 0 : palette] },
        15 | (1 << 13),
      );
  add(Kind.Layer, 0, 0, "Base", leds, {
    [F.Disabled]: 0,
    [F.Brightness]: 65,
    [F.DisplayTime]: 1000,
    [F.Primary]: [0x0088cc],
  });
  for (const id of [1, 2, 3])
    add(Kind.Layer, 0, id, id === 1 ? "Nav" : "", [], {
      [F.Disabled]: 1,
      [F.Brightness]: 100,
      [F.Primary]: [0xffffff],
      [F.DisplayTime]: 0,
    });
  add(Kind.Indicator, 0, 0, "Battery", [0, 1, 2], {
    [F.Primary]: [0x33cc22],
    [F.Secondary]: [0],
    [F.Tertiary]: [0xff3300, 0xffcc00, 0x33cc22],
  });
  if (!right)
    add(Kind.Indicator, 0, 1, "USB", [0], {
      [F.Primary]: [palette],
      [F.Secondary]: [0x0044cc],
      [F.Tertiary]: [0],
    });
  add(Kind.Indicator, 0, 2, "Bluetooth", [1, 2], {
    [F.Primary]: [rainbow],
    [F.Secondary]: [0x3333ff],
    [F.Tertiary]: [0],
  });
  if (!right)
    add(Kind.Indicator, 0, 3, "Caps Lock", [3], {
      [F.Primary]: [0xffffff],
      [F.Secondary]: [0],
    });
  const timing: Values = {
    [F.Timeout]: 3000,
    [F.BatteryTime]: inherit,
    [F.BleTime]: inherit,
    [F.PairHold]: 1,
  };
  if (!right) {
    timing[F.UsbTime] = inherit;
    timing[F.HidTime] = 0;
  }
  add(Kind.Timing, 0, 0, "Status timing", [], timing);
  for (let z = 1; z <= directory.topology!.capacity; z++)
    add(
      Kind.Zone,
      z,
      0,
      "Custom group",
      [],
      { ...profile("Solid", 0), [F.Primary]: [0xffffff], [F.Brightness]: 100 },
      15 | (1 << 13),
    );
  const visible = (key: number) =>
    key >> 16 === Kind.Main
      ? !groups.get(key)?.values[F.Disabled]
      : key >> 16 !== Kind.Zone ||
        ((key >> 8) & 255) === 0 ||
        !!groups.get(key)?.leds.length;
  let buffer = new Uint8Array(0),
    ticket = -1,
    mode = 0,
    next = 0,
    key = 0,
    mask = 0,
    expires = 0,
    counter = 1;
  return (req: Uint8Array) => {
    const res = req.slice(),
      d = view(res),
      offset = d.getUint16(4, true),
      token = d.getUint16(6, true),
      data = req.slice(8, 8 + req[3]);
    const err = (e: number) => {
      res[2] = Op.Error;
      res[3] = 1;
      res[8] = e;
      return res;
    };
    res[3] = 0;
    if (req[2] === Op.Live) {
      const active = Date.now() < expires ? mask : 0;
      res.set(
        [
          active ? 4 : state.enabled ? 1 : 0,
          active,
          255,
          0,
          right ? 72 : 87,
          2,
          0,
          1,
          0,
          directory.sources,
        ],
        8,
      );
      res[3] = 10;
      return res;
    }
    if (req[2] === Op.Show) {
      if (!data[0] || data[0] & ~directory.sources) return err(1);
      mask = data[0];
      const duration = Number(groups.get(Kind.Timing << 16)!.values[F.Timeout]);
      expires = Date.now() + Math.max(1, duration);
      return res;
    }
    if (
      req[2] === Op.Directory ||
      req[2] === Op.Group ||
      req[2] === Op.FactoryGroup
    ) {
      const group = groups.get(view(data).getUint32(0, true));
      if (req[2] !== Op.Directory && !group) return err(1);
      buffer =
        req[2] === Op.Directory
          ? encodeDirectory({
              ...directory,
              topology:
                data.length >= 8 && view(data).getUint32(4, true) >= 4
                  ? directory.topology
                  : directory.topology && {
                      ...directory.topology,
                      grid: undefined,
                    },
              groups: directory.groups.filter((g) => visible(g.key)),
            })
          : req[2] === Op.FactoryGroup
            ? encodeGroup({
                ...group!,
                values: defaults.get(view(data).getUint32(0, true))!,
                leds:
                  (defaults.get(view(data).getUint32(0, true))![
                    F.Members
                  ] as number[]) ?? group!.leds,
              })
            : encodeGroup(group!);
      ticket = token;
      mode = Op.Read;
      d.setUint16(4, buffer.length, true);
      return res;
    }
    if (req[2] === Op.Read) {
      if (mode !== Op.Read || token !== ticket) return err(7);
      const chunk = buffer.slice(offset, offset + 12);
      res[3] = chunk.length;
      res.set(chunk, 8);
      return res;
    }
    if (req[2] === Op.Begin || req[2] === Op.Restore) {
      const target = view(data).getUint32(0, true);
      const group = groups.get(target);
      if (!group) return err(1);
      if (group.revision !== view(data).getUint32(4, true)) return err(3);
      key = target;
      if (req[2] === Op.Begin) {
        buffer = new Uint8Array(offset);
        next = 0;
        ticket = token;
        mode = Op.Append;
        return res;
      }
    } else if (mode !== Op.Append || token !== ticket) return err(7);
    else if (req[2] === Op.Append) {
      if (offset !== next || next + data.length > buffer.length) return err(1);
      buffer.set(data, next);
      next += data.length;
      return res;
    } else if (req[2] !== Op.Commit || next !== buffer.length) return err(1);
    mode = 0;
    const group = groups.get(key)!;
    const initial = defaults.get(key)!;
    const values =
      req[2] === Op.Restore ? structuredClone(initial) : decodeValues(buffer);
    if (Object.keys(initial).some((id) => values[Number(id)] === undefined))
      return err(1);
    const kind = key >> 16,
      zone = (key >> 8) & 255;
    if (F.Renderer in values) {
      const r = Number(values[F.Renderer]),
        style = Number(values[F.Style]),
        dir = Number(values[F.Direction]);
      if (
        !(group.renderers & (1 << r)) ||
        r >= rendererNames.length ||
        style >= (effectStyles[r]?.length ?? 1) ||
        dir > Number(reversibleEffects.includes(r))
      )
        return err(1);
    }
    const members = values[F.Members];
    if (F.Members in initial) {
      if (
        !Array.isArray(members) ||
        new Set(members).size !== members.length ||
        members.some((led) => !directory.topology!.leds[led])
      )
        return err(1);
      for (const field of [F.Primary, F.Secondary, F.Tertiary]) {
        const colors = values[field];
        if (key === Kind.Indicator << 16 && field === F.Tertiary) continue;
        if (
          Array.isArray(colors) &&
          colors.length !== 1 &&
          colors.length !== members.length
        )
          return err(1);
      }
      if (kind === Kind.Zone) {
        if (
          zone >= directory.topology!.firstCustom &&
          req[2] !== Op.Restore &&
          (!members.length || !String(values[F.GroupName]).trim())
        )
          return err(1);
        if (
          members.some(
            (led) =>
              ![unassigned, zone].includes(directory.topology!.leds[led].owner),
          )
        )
          return err(3);
        for (const led of directory.topology!.leds)
          if (led.owner === zone) led.owner = unassigned;
        for (const led of members) directory.topology!.leds[led].owner = zone;
        for (const entry of directory.groups) {
          if (entry.key >>> 8 !== key >>> 8) continue;
          entry.label = String(values[F.GroupName]);
          if (entry.key === key) continue;
          const sibling = groups.get(entry.key)!;
          sibling.values = {
            ...withMembers(entry.key, sibling.values, members),
            [F.GroupName]: values[F.GroupName],
          };
          sibling.leds = [...members];
          sibling.revision =
            JSON.stringify(sibling.values) ===
            JSON.stringify(defaults.get(entry.key))
              ? 1
              : ++counter;
        }
      }
      group.leds = [...members];
    }
    group.values = values;
    group.revision = Object.keys(initial).every(
      (id) => JSON.stringify(values[+id]) === JSON.stringify(initial[+id]),
    )
      ? 1
      : ++counter;
    const entry = directory.groups.find((g) => g.key === key)!;
    if (kind === Kind.Main) entry.label = String(values[F.Name]);
    if (kind === Kind.Zone) entry.profile = String(values[F.Name]);
    if (!right && kind === Kind.Main) {
      const id = key & 255;
      const item = {
        id,
        name: String(values[F.Name]),
        renderer: rendererNames[Number(values[F.Renderer])].toLowerCase(),
      };
      const filtered = catalog.profiles.filter((p) => p.id !== id);
      if (!values[F.Disabled]) filtered.push(item);
      catalog.profiles = filtered.sort((a, b) => a.id - b.id);
      if (values[F.Disabled] && state.profile === id)
        state.profile = filtered[0]?.id ?? 255;
    }
    if (!right && kind === Kind.Zone && zone === 0) {
      catalog.zones[zone].name = entry.label;
      const p = catalog.zones[zone].profiles[key & 255];
      p.name = String(values[F.Name]);
      p.renderer = rendererNames[Number(values[F.Renderer])].toLowerCase();
    }
    return res;
  };
}

export function demoLightingEditor(catalog: Catalog, state: State) {
  const sides = [
    demoSide(false, catalog, state),
    demoSide(true, catalog, state),
  ];
  return ({ side, packet }: Exchange): Exchange => {
    if (sides[side]) return { side, packet: sides[side](packet) };
    const r = packet.slice();
    r[2] = Op.Error;
    r[3] = 1;
    r[8] = 4;
    return { side, packet: r };
  };
}
