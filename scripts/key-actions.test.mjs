// Run with node --test scripts/key-actions.test.mjs.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  appType: "custom",
  ssr: { noExternal: ["@zmkfirmware/zmk-studio-ts-client"] },
});
after(() => server.close());
const load = (name) => server.ssrLoadModule("/src/" + name + ".ts");
const { listActions, groupedResults, accepts, describe } =
  await load("behaviors/actions");
const { bindingGlyph } = await load("behaviors/actionGlyph");
const { keyIndex } = await load("behaviors/keyPress");
const { matrixChoices } = await load("behaviors/matrixActions");
const { createDemoConnection } = await load("rpc/demo");
const demo = createDemoConnection();
const writer = demo.request_writable.getWriter();
const reader = demo.request_response_readable.getReader();
async function rpc(request) {
  await writer.write({ requestId: 1, ...request });
  return (await reader.read()).value;
}
const ids = (await rpc({ behaviors: { listAllBehaviors: true } })).behaviors
  .listAllBehaviors.behaviors;
const behaviors = [];
for (const behaviorId of ids) {
  behaviors.push(
    (await rpc({ behaviors: { getBehaviorDetails: { behaviorId } } })).behaviors
      .getBehaviorDetails,
  );
}
const catalog = (await rpc({ lighting: { getCatalog: true } })).lighting
  .catalog;
const lm = behaviors.find((b) => b.displayName === "LED Matrix");
const kp = behaviors.find((b) => b.displayName === "Key Press");
const actions = listActions(behaviors, [], catalog);
const search = (query) =>
  groupedResults(actions, "Lighting", query).flatMap((g) => g.entries);
const binding = (behavior, param1, param2 = 0) => ({
  behaviorId: behavior.id,
  param1,
  param2,
});

test("each firmware matrix macro finds one command with the same icon on the keycap", () => {
  const macros =
    "ON OFF TOG BRI BRD EFF EFR EFS BRT STA SPI SPD SPS HUI HUD HUS CFF CFR CFS".split(
      " ",
    );
  macros.forEach((macro, i) => {
    const matches = search("LM_" + macro);
    assert.equal(matches.length, 1);
    const [action] = matches;
    assert.equal(action.binding.param1, i);
    assert.equal(action.group, "LED Matrix");
    assert.equal(action.glyph.icon, bindingGlyph(action.binding, lm).icon);
    assert(accepts(lm, [], action.binding));
  });
  assert.equal(bindingGlyph(binding(lm, 8), lm).mark, "0%");
  for (const [mask, names] of [
    [0, "All"],
    [5, "Battery + Bluetooth"],
  ])
    assert(describe(binding(lm, 9, mask), lm, [], catalog).endsWith(names));
  assert(!accepts(lm, [], binding(lm, 8, 101)));
  assert(!accepts(lm, [], binding(lm, 9, 16)));
});

test("the demo palette and LM_HUS accept the same 36 hue indices", async () => {
  assert.equal(catalog.hueCount, 36);
  const command = search("LM_HUS")[0].binding.param1;
  assert.deepEqual(
    [...matrixChoices(lm, command, catalog).keys()],
    Array.from({ length: 36 }, (_, i) => i),
  );
  for (const hue of [1, 35]) {
    assert(accepts(lm, [], binding(lm, command, hue)));
    assert.equal(
      (await rpc({ lighting: { set: { hue } } })).lighting.state.hue,
      hue,
    );
  }
  assert(!accepts(lm, [], binding(lm, command, 36)));
  assert.equal(
    (await rpc({ lighting: { set: { hue: 36 } } })).lighting.rejected,
    true,
  );
  assert.equal(
    (await rpc({ lighting: { getState: true } })).lighting.state.hue,
    35,
  );
});

test("only valid zone/preset pairs are writable, including with legacy metadata", () => {
  const cmd = 18;
  const device = {
    ...lm,
    metadata: [
      {
        param1: [{ constant: cmd }],
        param2: [{ constant: 0 }, { constant: 0x103 }],
      },
    ],
  };
  const board = {
    ...catalog,
    zones: [
      catalog.zones[0],
      { id: 1, name: "Thumbs", profiles: [{ id: 3, name: "Glow" }] },
    ],
  };
  assert.deepEqual(
    [...matrixChoices(device, cmd, board)],
    [
      [0, "Off"],
      [0x103, "Glow"],
    ],
  );
  assert.match(
    describe(binding(lm, cmd, 0x103), device, [], board),
    /Thumbs · Glow$/,
  );
  const legacy = {
    ...lm,
    metadata: [{ param1: [{ constant: cmd }], param2: [] }],
  };
  assert.deepEqual([...matrixChoices(legacy, cmd, board).keys()], [0]);
  assert(!accepts(legacy, [], binding(lm, cmd, 0x103)));
  const trimmed = listActions([lm], [], {
    ...catalog,
    profiles: [],
    zones: [],
  });
  assert.deepEqual(
    trimmed
      .filter((a) => a.category === "Lighting")
      .map((a) => a.binding.param1),
    [0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 15],
  );
});

test("ZMK aliases in all eight documented categories map to one action per supported encoding", () => {
  const keys = actions.filter(
    (a) => a.binding.behaviorId === kp.id && a.category !== "All behaviors",
  );
  const codes = new Map(keys.map((a) => [a.binding.param1, a]));
  assert.equal(codes.size, keys.length);
  for (const [encoded, [aliases, category]] of Object.entries(keyIndex)) {
    const code = Number(encoded);
    if (!accepts(kp, [], binding(kp, code))) continue;
    const a = codes.get(code);
    assert(a, aliases);
    for (const alias of aliases.split(" "))
      assert(a.keywords.split(" ").includes(alias), alias);
    assert(a.glyph.icon);
    assert(a.keywords.includes(category));
  }
  for (const [code, alias] of [
    [0x70004, "A"],
    [0x700e6, "RALT"],
    [0x70059, "KP_N1"],
    [0x7007c, "K_COPY"],
    [0xc00e2, "M_MUTE"],
    [0xc0184, "C_AL_WORD"],
    [0xc02c7, "C_KBIA_PREV"],
    [0xc0030, "C_PWR"],
  ])
    assert(
      search(alias).some((a) => a.binding.param1 === code),
      alias,
    );
  assert.notEqual(
    describe(binding(kp, 0x7007f), kp),
    describe(binding(kp, 0xc00e2), kp),
  );
  for (const [code, mark] of [
    [0x70004, "A"],
    [0x02070004, "⇧A"],
    [0x40070004, "R⌥A"],
    [0x0207001e, "!"],
    [0xc0fff, "0x000C0FFF"],
  ])
    assert.equal(bindingGlyph(binding(kp, code), kp).mark, mark);
  const limited = {
    ...kp,
    metadata: [
      {
        param1: [{ hidUsage: { keyboardMax: 0x67, consumerMax: 255 } }],
        param2: [],
      },
    ],
  };
  for (const [code, valid] of [
    [0x80070004, true],
    [0x700e7, true],
    [0x7007f, false],
    [0x700e8, false],
    [0xc0fff, false],
    [0x10082, false],
  ])
    assert.equal(accepts(limited, [], binding(kp, code)), valid);
});

test("official actions use device metadata, aliases, disjoint command parameters and signed motion", () => {
  const move = behaviors.find((b) => b.bindingType?.bindingLabel === "mmv");
  const named = behaviors.find((b) => b.displayName === "Build project");
  const mouse = search("MOVE_LEFT")[0];
  assert.equal(mouse.binding.param1, (-600 << 16) >>> 0);
  assert.equal(mouse.glyph.mark, "←");
  assert.equal(
    describe({ ...mouse.binding, param1: 0xffff000a }, move),
    "Mouse Move · X -1 · Y 10",
  );
  assert.equal(
    search("&compile").find((a) => a.category === "Macros").glyph.icon,
    "macro",
  );
  assert.equal(
    bindingGlyph(binding(named, 0), { ...named, displayName: "Bluetooth" })
      .icon,
    "macro",
  );
  const bt = behaviors.find((b) => b.displayName === "Bluetooth");
  assert.equal(search("BT_SEL").length, 1);
  assert(accepts(bt, [], binding(bt, 3, 0)));
  assert(!accepts(bt, [], binding(bt, 3, 5)));
  assert(!accepts(bt, [], binding(bt, 1, 3)));
  const rgb = behaviors.find((b) => b.displayName === "Underglow");
  assert(accepts(rgb, [], binding(rgb, 14, (360 << 16) | (100 << 8) | 100)));
  assert(!accepts(rgb, [], binding(rgb, 14, 361 << 16)));
  const sensor = {
    ...named,
    bindingType: { ...named.bindingType, sensorOnly: true },
  };
  assert.deepEqual(listActions([sensor], []), []);
  assert(!accepts(sensor, [], binding(sensor, 0)));
});

test("encoder direction overrides round-trip through keymap RPC, save, discard and restore", async () => {
  const { Request, RequestResponse } = await load("rpc/generated/studio");
  const keymap = async (keymap) => {
    const wire = Request.decode(
      Request.encode({ requestId: 1, keymap }).finish(),
    );
    const response = await rpc(wire);
    return RequestResponse.decode(RequestResponse.encode(response).finish())
      .keymap;
  };
  const maps = async () =>
    (await keymap({ getKeymap: true })).getKeymap.layers.map(
      (l) => l.encoderMap,
    );
  const set = (layerId, sensorIndex, counterclockwise, binding) =>
    keymap({
      setEncoderBinding: {
        layerId,
        sensorIndex,
        counterclockwise,
        ...(binding ? { binding } : { restore: true }),
      },
    });
  const before = await maps(),
    ccw = binding(lm, 8, 35),
    cw = binding(kp, 0xc00e9);
  assert.equal((await set(0, 0, false, cw)).setEncoderBinding, 0);
  assert.equal((await set(0, 0, true, ccw)).setEncoderBinding, 0);
  assert.equal(
    (await set(0, 0, true, binding(lm, 8, 101))).setEncoderBinding,
    3,
  );
  assert.equal((await set(0, 3, true, ccw)).setEncoderBinding, 1);
  assert.equal((await keymap({ saveChanges: true })).saveChanges.ok, true);
  const saved = await maps();
  assert.deepEqual(saved[0].encoders[0], {
    clockwise: { binding: cw, overridden: true },
    counterclockwise: { binding: ccw, overridden: true },
  });
  assert.deepEqual(saved[0].encoders[1], before[0].encoders[1]);
  assert.deepEqual(saved[1], before[1]);
  await set(0, 0, true);
  const restored = (await maps())[0].encoders[0];
  assert.deepEqual(restored.clockwise, saved[0].encoders[0].clockwise);
  assert.deepEqual(
    restored.counterclockwise,
    before[0].encoders[0].counterclockwise,
  );
  await keymap({ discardChanges: true });
  assert.deepEqual(await maps(), saved);
});

test("an upstream keymap has no encoder controls and keeps its existing bindings", async () => {
  // Encoded with the pinned upstream keymap.proto: layer Base, &kp A.
  const bytes = Buffer.from("0a0e1204426173651a0608261084801c1810", "hex");
  const { Keymap } = await load("rpc/generated/keymap");
  const map = Keymap.decode(bytes);
  assert.equal(map.layers[0].encoderMap, undefined);
  assert.deepEqual(map.layers[0].bindings, [
    { behaviorId: 19, param1: 0x70004, param2: 0 },
  ]);
  assert.deepEqual(Buffer.from(Keymap.encode(map).finish()), bytes);
});

test("keycap explanations use current binding values, layer names and device names", async () => {
  const { bindingExplanation } = await load("behaviors/bindingExplanation");
  const layers = [{ id: 7, name: "Nav" }];
  const explain = (b, p1, p2 = 0) =>
    bindingExplanation(binding(b, p1, p2), b, layers, catalog);
  assert.equal(explain(kp, 0x70004), "Send A.");
  assert.equal(explain(kp, 0x40070004), "Send Right Alt + A.");
  assert.equal(explain(lm, 8, 0), "Set LED Matrix brightness to 0%.");
  assert.equal(explain(lm, 8, 35), "Set LED Matrix brightness to 35%.");
  const lt = { ...kp, displayName: "Layer-Tap" };
  assert.equal(
    explain(lt, 7, 0x70029),
    "Tap for Escape. Hold to activate Nav.",
  );
  layers[0].name = "Symbols";
  assert.equal(
    explain(lt, 7, 0x70029),
    "Tap for Escape. Hold to activate Symbols.",
  );
  const macro = behaviors.find((b) => b.id === 9);
  assert.equal(explain(macro, 0), "Run the “Build project” macro.");
  assert.equal(
    explain({ ...kp, displayName: "Custom binding" }, 0, 22),
    "Custom binding (parameters 0, 22).",
  );
  assert.equal(
    bindingExplanation(undefined, undefined, layers),
    "Binding information unavailable.",
  );
});

test("preset shortcuts use active sparse IDs and shared names", () => {
  const command = search("LM_EFS")[0].binding.param1;
  const profiles = [
    { id: 0, name: "Palette", renderer: "solid" },
    { id: 253, name: "Night", renderer: "breathe" },
  ];
  assert.deepEqual(
    [...matrixChoices(lm, command, { ...catalog, profiles })],
    [
      [0, "Palette"],
      [253, "Night"],
    ],
  );
  assert(accepts(lm, [], binding(lm, command, 253)));
});
