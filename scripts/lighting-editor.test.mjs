// Run with node --test scripts/lighting-editor.test.mjs.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  ssr: { noExternal: ["@zmkfirmware/zmk-studio-ts-client"] },
});
after(() => server.close());

const { demoLighting } = await server.ssrLoadModule("/src/rpc/demoLighting.ts");
const { lightingEditor, Kind, Field, Op, rainbow } = await server.ssrLoadModule(
  "/src/rpc/lightingEditor.ts",
);

// Deliver the demo's actual packet replies via the same streams used by call_rpc.
function keyboard(intercept) {
  const handle = demoLighting();
  let responses;
  const conn = {
    current_request: 0,
    request_response_readable: new ReadableStream({
      start(controller) {
        responses = controller;
      },
    }),
    request_writable: new WritableStream({
      write(request) {
        const exchange = request.lighting.exchange;
        const process = () => handle(request.lighting);
        const lighting = intercept ? intercept(exchange, process) : process();
        responses.enqueue({ requestId: request.requestId, lighting });
      },
    }),
  };
  return [lightingEditor(conn, 0), lightingEditor(conn, 1)];
}

test("side-local groups, per-LED colors and independent restore", async () => {
  const [left, right] = keyboard();
  const [a, b] = await Promise.all([left.directory(), right.directory()]);
  assert.notEqual(a.board, b.board);
  assert.deepEqual(
    b.groups.filter((g) => g.key >> 16 === Kind.Zone).map((g) => g.label),
    ["Thumb LEDs"],
  );
  const key = Kind.Main << 16,
    layer = Kind.Layer << 16;
  const initial = await right.group(key),
    originalLeft = await left.group(key);
  const colors = initial.leds.map((_, i) => (i % 2 ? rainbow : 0x123456));
  const edited = await right.save(key, initial.revision, {
    ...initial.values,
    [Field.Primary]: colors,
  });
  assert.deepEqual(edited.values[Field.Primary], colors);
  await assert.rejects(
    right.save(key, initial.revision, initial.values),
    /changed on the keyboard/,
  );
  const before = await right.group(layer);
  const afterLayer = await right.save(layer, before.revision, {
    ...before.values,
    [Field.DisplayTime]: 0,
  });
  const restored = await right.save(key, edited.revision);
  assert.deepEqual(restored, initial);
  assert.deepEqual(await right.group(layer), afterLayer);
  assert.deepEqual(await left.group(key), originalLeft);
});

test("incomplete transfers, refused writes and lost acknowledgments", async () => {
  let failure,
    commits = 0;
  const [, right] = keyboard((ex, process) => {
    const op = ex.packet[2];
    if (op === Op.Commit && failure !== "full") commits++;
    if (failure === "lost" && op === Op.Commit) process();
    if (
      (failure === "interrupted" && op === Op.Append) ||
      (failure && op === Op.Commit)
    ) {
      const packet = ex.packet.slice();
      packet[2] = Op.Error;
      packet[3] = 1;
      packet[8] = failure === "full" ? 2 : 4;
      return { exchange: { side: ex.side, packet } };
    }
    return process();
  });
  const key = Kind.Main << 16,
    initial = await right.group(key);
  const draft = { ...initial.values, [Field.Name]: "Right only" };
  for (const [fault, error] of [
    ["interrupted", /offline/],
    ["full", /storage is full/],
  ]) {
    failure = fault;
    await assert.rejects(right.save(key, initial.revision, draft), error);
    assert.deepEqual(await right.group(key), initial);
  }
  failure = "lost";
  await assert.rejects(right.save(key, initial.revision, draft), /offline/);
  assert.deepEqual((await right.group(key)).values, draft);
  assert.equal(commits, 1);
});

const { makePreview, previewGrid, sampleLight, stillFrameTime } =
  await server.ssrLoadModule("/src/keyboard/matrixPreview.ts");
const demo = demoLighting();
const { catalog } = demo({ getCatalog: true });
const { state } = demo({ getState: true });
const grid = previewGrid(
  Array.from({ length: 20 }, (_, i) => ({
    x: 100 * (i % 5),
    y: 100 * Math.floor(i / 5),
    width: 100,
    height: 100,
  })),
);
function effect(renderer, values = {}) {
  return makePreview(
    catalog,
    { ...state, brightness: 100, speed: 4 },
    {
      values: { [Field.Renderer]: renderer, [Field.Period]: 1000, ...values },
    },
  );
}
function sample(effect, time, key = 0, presses = new Map()) {
  return sampleLight(effect, grid, key, time, presses);
}

test("solid, breathe, spectrum and swirl respect color, brightness, period and speed", () => {
  const solid = effect(0, {
    [Field.Primary]: [0x00ff00],
    [Field.Brightness]: 75,
  });
  assert.deepEqual(sample(solid, 500), { h: 120, s: 100, l: 50, alpha: 0.75 });
  assert.deepEqual(sample(solid, 500), sample(solid, 0));
  assert.deepEqual(
    [0, 250, 500, 1000].map((t) => sample(effect(1), t).alpha),
    [0, 0.25, 1, 0],
  );
  assert.equal(sample(effect(2), 500).h, 180);
  assert.equal(sample(effect(2), 250, 1).h, sample(effect(2), 250, 2).h);
  assert.notEqual(sample(effect(3), 250, 1).h, sample(effect(3), 250, 2).h);
  const basic = makePreview(
    { ...catalog, hueCount: 12 },
    { ...state, speed: 2, hue: 4 },
  );
  assert.equal(sample(basic, 0).h, 120);
  assert.equal(
    basic.period,
    2 * makePreview(catalog, { ...state, speed: 4 }).period,
  );
  assert.notEqual(
    sample(effect(0, { [Field.Primary]: [rainbow] }), 0).h,
    sample(effect(0, { [Field.Primary]: [rainbow] }), 600).h,
  );
  assert.equal(makePreview(catalog, { ...state, enabled: false }), undefined);
  assert.equal(makePreview(catalog, { ...state, brightness: 0 }), undefined);
  assert.equal(makePreview({ ...catalog, profiles: [] }, state), undefined);
});

test("keypress holds, spreads and fades after release; ripple travels outwards", () => {
  const pressed = new Map([[0, { start: 100 }]]);
  const keypress = effect(4, {
    [Field.Range]: 1,
    [Field.Afterglow]: 100,
    [Field.Fade]: 200,
  });
  assert.equal(sample(keypress, 500, 0).alpha, 0);
  assert.equal(sample(keypress, 500, 0, pressed).alpha, 1);
  assert.equal(sample(keypress, 500, 6, pressed).alpha, 0.25);
  pressed.get(0).end = 500;
  assert.deepEqual(
    [600, 700, 800].map((t) => sample(keypress, t, 0, pressed).alpha),
    [1, 0.5, 0],
  );
  const ripple = effect(5);
  assert.equal(sample(ripple, 100, 0, pressed).alpha, 1);
  assert.equal(sample(ripple, 100, 2, pressed).alpha, 0);
  assert.equal(sample(ripple, 300, 2, pressed).alpha, 1);
  assert.equal(sample(ripple, 300, 0, pressed).alpha, 0.2);
});

test("rain travels down columns and starlight twinkles independently across keys", () => {
  const rain = effect(6),
    stars = effect(7);
  const times = Array.from({ length: 100 }, (_, i) => i * 25);
  const firstDrop = times.find((t) => sample(rain, t, 0).alpha === 1);
  assert.ok(
    times.some(
      (t) =>
        t > firstDrop && t < firstDrop + 400 && sample(rain, t, 5).alpha === 1,
    ),
  );
  const star = times.map((t) => sample(stars, t, 0).alpha);
  assert.ok(star.some((a) => a > 0) && star.includes(0));
  assert.notDeepEqual(
    star,
    times.map((t) => sample(stars, t, 1).alpha),
  );
});

test("spatial mapping rotates key centers about the reported pivot and assigns colors by physical order", () => {
  const rotated = previewGrid([
    { x: 100, y: 0, width: 200, height: 100, rx: 0, ry: 0, r: 9000 },
    { x: 0, y: 0, width: 100, height: 100 },
  ]);
  assert.ok(Math.abs(rotated.points[0].x + 0.5) < 1e-9);
  assert.equal(rotated.points[0].y, 2);
  const multi = effect(0, { [Field.Primary]: [0xff0000, 0x00ff00] });
  assert.deepEqual(
    [0, 1].map((i) => sampleLight(multi, rotated, i, 0, new Map()).h),
    [120, 0],
  );
});

test("reduced motion gives a visible static rain or starlight frame on a single key", () => {
  const one = previewGrid([{ x: 0, y: 0, width: 100, height: 100 }]);
  for (const renderer of [6, 7]) {
    const e = effect(renderer);
    assert.ok(
      sampleLight(e, one, 0, stillFrameTime(e, one), new Map()).alpha > 0,
    );
  }
});

test("reordering members preserves status colors, battery ranges and sibling presets", async () => {
  const { withMembers } = await server.ssrLoadModule(
    "/src/rpc/lightingEditor.ts",
  );
  const [left, right] = keyboard();
  const battery = Kind.Indicator << 16,
    zone = Kind.Zone << 16;
  const a = await left.group(battery);
  const b = withMembers(
    battery,
    { ...a.values, [Field.Primary]: [123, 456, 789] },
    [2, 6, 0],
  );
  assert.deepEqual(b[Field.Primary], [789, 123, 123]);
  assert.deepEqual(b[Field.Tertiary], a.values[Field.Tertiary]);
  await left.save(battery, a.revision, b);
  assert.deepEqual((await right.group(battery)).leds, [0, 1, 2]);
  const sibling = await left.group(zone + 1);
  await left.save(zone + 1, sibling.revision, {
    ...sibling.values,
    [Field.Primary]: [45, 67],
  });
  const first = await left.group(zone);
  await left.save(
    zone,
    first.revision,
    withMembers(zone, first.values, [5, 2, 4]),
  );
  const changed = await left.group(zone + 1);
  assert.deepEqual(changed.leds, [5, 2, 4]);
  assert.deepEqual(changed.values[Field.Primary], [67, 45, 45]);
  await assert.rejects(
    left.save(zone + 1, sibling.revision, sibling.values),
    /changed/,
  );
});

test("custom slots accept mixed members, enforce ownership, and delete without renumbering", async () => {
  const [left] = keyboard();
  const { topology } = await left.directory();
  assert.equal(topology.leds[1].position, 2);
  assert.equal(topology.leds[6].position, 65535);
  const keys = Array.from(
    { length: topology.capacity },
    (_, i) => (Kind.Zone << 16) | ((i + topology.firstCustom) << 8),
  );
  const allocations = [[1, 6], [0], [2], [3]];
  for (const [i, key] of keys.entries()) {
    const empty = await left.group(key);
    assert.deepEqual(empty.leds, []);
    const config = {
      ...empty.values,
      [Field.GroupName]: "Zone " + i,
      [Field.Members]: allocations[i],
    };
    await left.save(key, empty.revision, config);
  }
  const last = await left.group(keys.at(-1));
  await assert.rejects(
    left.save(keys.at(-1), last.revision, {
      ...last.values,
      [Field.Members]: [6],
    }),
    /changed/,
  );
  const first = await left.group(keys[0]);
  await left.save(keys[0], first.revision);
  const after = await left.directory();
  assert.equal(after.topology.leds[6].owner, 65535);
  assert(!after.groups.some((g) => g.key === keys[0]));
  assert.deepEqual(await left.group(keys.at(-1)), last);
});

test("the directory reader accepts a v1 side without editable membership", async () => {
  const { encodeDirectory, view } = await server.ssrLoadModule(
    "/src/rpc/lightingEditor.ts",
  );
  const old = {
    board: "Legacy",
    sources: 1,
    groups: [{ key: Kind.Indicator << 16, label: "Battery", profile: "" }],
  };
  const bytes = encodeDirectory(old);
  const [legacy] = keyboard(({ side, packet }) => {
    const reply = packet.slice();
    if (packet[2] === Op.Directory)
      view(reply).setUint16(4, bytes.length, true);
    else {
      const offset = view(packet).getUint16(4, true),
        chunk = bytes.slice(offset, offset + 12);
      reply[3] = chunk.length;
      reply.set(chunk, 8);
    }
    return { exchange: { side, packet: reply } };
  });
  assert.deepEqual(await legacy.directory(), old);
});

const { applyMainOperation } = await server.ssrLoadModule(
  "/src/rpc/mainPresets.ts",
);
test("shared main operations keep per-side settings, stable IDs and resume from readback", async () => {
  let interrupt = false,
    offline = false;
  const clients = keyboard((ex, process) => {
    if (
      (offline && ex.side === 1) ||
      (interrupt && ex.side === 1 && ex.packet[2] === Op.Commit)
    ) {
      if (!offline) {
        process();
        interrupt = false;
      }
      const packet = ex.packet.slice();
      packet[2] = Op.Error;
      packet[3] = 1;
      packet[8] = 4;
      return { exchange: { side: ex.side, packet } };
    }
    return process();
  });
  let draft, fallback;
  const save = () =>
    applyMainOperation(
      draft,
      clients,
      (op) => {
        draft = op;
      },
      async (old, next) => {
        fallback = [old, next];
      },
    );
  function start(action, source, name) {
    draft = { request: { action, source, side: 0, name } };
    return save();
  }
  const base = Kind.Main << 16;
  offline = true;
  await assert.rejects(start("create", base, "First"), /offline/);
  assert.equal(draft.targets, undefined);
  offline = false;
  interrupt = true;
  await assert.rejects(save(), /offline/);
  assert.equal(draft.targets.length, 2);
  const key = await save();
  for (const [i, client] of clients.entries()) {
    const g = await client.group(key);
    assert.equal(
      g.leds.length,
      (await client.directory()).topology.leds.length,
    );
    assert.deepEqual(g.values[Field.Primary], [0xffffff]);
    assert.equal(g.values[Field.Renderer], 0);
    await client.save(key, g.revision, {
      ...g.values,
      [Field.Members]: [4, i],
      [Field.Primary]: [0x123456, i],
      [Field.Period]: 1000 + i,
    });
  }
  const copy = await start("copy", key, "Copy");
  for (const client of clients) {
    assert.deepEqual((await client.group(copy)).values, {
      ...(await client.group(key)).values,
      [Field.Name]: "Copy",
    });
  }
  await start("rename", copy, "Shared");
  const third = await start("create", base, "Three");
  await start("create", base, "Four");
  await assert.rejects(
    start("copy", key, "Overflow"),
    /No free main preset slot/,
  );
  await start("delete", key, "");
  assert.deepEqual(fallback, [key & 255, 0]);
  for (const client of clients) {
    const ids = (await client.directory()).groups.map((g) => g.key);
    assert(!ids.includes(key) && ids.includes(copy) && ids.includes(third));
    assert.equal((await client.group(copy)).values[Field.Name], "Shared");
  }
  assert.equal(await start("create", base, "Reused"), key);
});

test("layer settings use stable IDs including new keymap layers and restore factory members", async () => {
  const [client] = keyboard();
  for (const id of [1, 2, 3]) {
    const key = (Kind.Layer << 16) | id,
      initial = await client.group(key);
    assert.equal(initial.values[Field.Disabled], 1);
    const added = await client.save(key, initial.revision, {
      ...initial.values,
      [Field.Disabled]: 0,
      [Field.Primary]: [0x122334, 0x123456],
      [Field.Members]: [5, 1],
      [Field.DisplayTime]: 35,
    });
    assert.deepEqual(added.leds, [5, 1]);
    assert.deepEqual(await client.save(key, added.revision), initial);
  }
});

test("preview maps sparse reordered LED IDs and a timed layer independently of the main mask", () => {
  const topology = {
    firstCustom: 0,
    capacity: 0,
    leds: [
      { position: 2 },
      { position: 65535 },
      { position: 0 },
      { position: 1 },
    ],
  };
  const main = {
    leds: [2, 0],
    values: { [Field.Renderer]: 0, [Field.Primary]: [0x00ff00, 0xff0000] },
  };
  const layer = {
    leds: [3],
    values: {
      [Field.Primary]: [0x0000ff],
      [Field.DisplayTime]: 100,
      [Field.Brightness]: 50,
    },
  };
  const e = makePreview(
    catalog,
    { ...state, brightness: 100 },
    main,
    topology,
    layer,
    50,
  );
  assert.equal(sample(e, 10, 0).h, 120);
  assert.equal(sample(e, 10, 2).h, 0);
  assert.deepEqual(sample(e, 80, 1), { h: 240, s: 100, l: 50, alpha: 0.5 });
  assert.equal(sample(e, 151, 1).alpha, 0);
  assert.equal(sample(e, 10, 3).alpha, 0);
});

test("side lights use logical membership, zone-relative swirl, and the active layer and status colors", async () => {
  const { sampleExtraLight } = await server.ssrLoadModule(
    "/src/keyboard/matrixPreview.ts",
  );
  const { statusColors } = await server.ssrLoadModule(
    "/src/keyboard/statusPreview.ts",
  );
  const [client] = keyboard();
  const { topology } = await client.directory();
  const group = {
    leds: [5, 4],
    values: { [Field.Primary]: [0x00ff00, 0xff0000], [Field.Renderer]: 3 },
  };
  const build = (layer, status) =>
    makePreview(
      catalog,
      { ...state, brightness: 100 },
      group,
      topology,
      layer,
      Infinity,
      status,
    );
  assert.equal(sampleExtraLight(build(), 4, 0, true).h, 180);
  assert.equal(
    sampleExtraLight(build(), 4, 0, false).h,
    Math.round((360 * 4) / topology.leds.length),
  );
  assert.equal(sampleExtraLight(build(), 6, 0, true).alpha, 0);
  const layer = {
    leds: [4],
    values: { [Field.Primary]: [0x0000ff], [Field.Brightness]: 50 },
  };
  assert.deepEqual(sampleExtraLight(build(layer), 4, 0, true), {
    h: 240,
    s: 100,
    l: 50,
    alpha: 0.5,
  });
  const live = { mask: 9, reported: 9, battery: 50, locks: 2 };
  const battery = {
    leds: [5, 4],
    values: {
      [Field.Primary]: [0xffffff],
      [Field.Secondary]: [0],
      [Field.Tertiary]: [0x11ff11, 0xff0000],
    },
  };
  const caps = {
    leds: [4],
    values: { [Field.Primary]: [0x00ff00], [Field.Secondary]: [0] },
  };
  const status = statusColors(
    live,
    new Map([
      [0, battery],
      [3, caps],
    ]),
  );
  assert.equal(status.get(5).value, 0x11ff11);
  assert.deepEqual(sampleExtraLight(build(layer, status), 4, 0, true), {
    h: 120,
    s: 100,
    l: 50,
    alpha: 1,
  });
  group.values[Field.Renderer] = 5;
  assert.equal(sampleExtraLight(build(), 4, 300, false).alpha, 0);
});

test("physical effects use side-local cells, persistent style and bounded input", async () => {
  const { strike } = await server.ssrLoadModule(
    "/src/keyboard/effectShapes.ts",
  );
  const [left, right] = keyboard();
  const key = Kind.Main << 16;
  const [{ topology }, group, other] = await Promise.all([
    left.directory(),
    left.group(key),
    right.group(key),
  ]);
  assert.equal(group.renderers, 0xffff);
  assert.equal(other.renderers & (1 << 9), 0);
  assert.ok(other.renderers & (1 << 13));
  const wave = await left.save(key, group.revision, {
    ...group.values,
    [Field.Renderer]: 9,
    [Field.Style]: 1,
    [Field.Direction]: 1,
    [Field.Primary]: [0xff0000],
    [Field.Brightness]: 100,
    [Field.Period]: 1000,
  });
  assert.deepEqual(await left.group(key), wave);
  const local = makePreview(
    catalog,
    { ...state, brightness: 100, speed: 4 },
    wave,
    topology,
  );
  assert.equal(sample(local, 250, 0).h, 90);
  assert.equal(sample(local, 250, 10).h, 346);
  const presses = new Map();
  presses.input = { hits: [], heat: new Map() };
  const heat = { ...local, renderer: "heatmap", style: 0 };
  const origin = heat.cells.get(0);
  strike(presses.input, heat, origin, heat.cells, 1200);
  strike(presses.input, heat, origin, heat.cells, 1300);
  assert.equal(sample(heat, 1300, 0, presses).alpha, 0.7);
  assert.equal(sample(heat, 1300, 1, presses).alpha, 0.14);
  assert.equal(sample(heat, 2000, 0, presses).alpha, 0);
  const reaction = { ...local, renderer: "reactive", style: 4 };
  strike(presses.input, reaction, origin, heat.cells, 10);
  strike(presses.input, reaction, heat.cells.get(2), heat.cells, 60);
  assert.equal(sample(reaction, 60, 0, presses).alpha, 0.95);
  assert.equal(sample(reaction, 60, 1, presses).alpha, 1);
  for (let i = 0; i < 10; i++)
    strike(presses.input, reaction, origin, heat.cells, 70 + i);
  assert.equal(presses.input.hits.length, 8);
  assert.deepEqual(await left.save(key, wave.revision), group);
});
