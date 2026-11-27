import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type {
  Request,
  RequestResponse,
  Notification,
} from "./generated/studio";
import { LightingSupport } from "./generated/core";
import { demoHueCount, demoLighting } from "./demoLighting";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import type { Layer, Keymap, PhysicalLayout } from "./generated/keymap";
import { matrixCommands } from "../behaviors/matrixActions";
import { accepts, type DeviceBehavior } from "../behaviors/actions";

const key = { name: "Key", hidUsage: { keyboardMax: 255, consumerMax: 4095 } };
const target = { name: "Layer", layerId: {} };
const behaviors: DeviceBehavior[] = [
  {
    id: 1,
    displayName: "Key Press",
    metadata: [{ param1: [key], param2: [] }],
  },
  {
    id: 2,
    displayName: "Mod-Tap",
    metadata: [
      { param1: [{ ...key, name: "Hold" }], param2: [{ ...key, name: "Tap" }] },
    ],
  },
  {
    id: 3,
    displayName: "Momentary Layer",
    metadata: [{ param1: [target], param2: [] }],
  },
  {
    id: 5,
    displayName: "LED Matrix",
    metadata: matrixCommands.map((c, i) => {
      const bounds = {
        brightness: [0, 100],
        status: [0, 15],
        speed: [1, 5],
        hue: [0, demoHueCount - 1],
        preset: [0, 254],
        zone: [0, 0],
      };
      const range =
        c.parameter && c.parameter !== "zonePreset"
          ? bounds[c.parameter]
          : undefined;
      return {
        param1: [{ constant: i, name: c.label }],
        param2: range
          ? [{ name: c.parameter!, range: { min: range[0], max: range[1] } }]
          : c.parameter === "zonePreset"
            ? [
                { constant: 0, name: "Off" },
                { constant: 1, name: "Glow" },
              ]
            : [],
      };
    }),
  },
  { id: 4, displayName: "Transparent", metadata: [] },
];

function demoBehavior(
  id: number,
  displayName: string,
  label: string,
  kind: string,
  metadata: DeviceBehavior["metadata"] = [],
) {
  behaviors.push({
    id,
    displayName,
    bindingType: {
      compatible: "zmk_behavior_" + kind,
      bindingLabel: label,
      sensorOnly: false,
    },
    metadata,
  });
}
const commands = (...names: string[]) =>
  names.map((name, constant) => ({ name, constant }));
demoBehavior(6, "Bluetooth", "bt", "bluetooth", [
  {
    param1: commands("Clear profile", "Next profile", "Previous profile"),
    param2: [],
  },
  {
    param1: [
      { name: "Select profile", constant: 3 },
      { name: "Disconnect profile", constant: 5 },
    ],
    param2: [{ name: "Profile slot", range: { min: 0, max: 4 } }],
  },
]);
demoBehavior(7, "Mouse Move", "mmv", "input_two_axis", [
  { param1: [{ name: "Motion", signedAxes: {} }], param2: [] },
]);
demoBehavior(8, "Mouse Scroll", "msc", "input_two_axis", [
  { param1: [{ name: "Scroll", signedAxes: {} }], param2: [] },
]);
demoBehavior(9, "Build project", "compile", "macro");
demoBehavior(10, "Double Escape", "double_esc", "tap_dance");
demoBehavior(11, "Caps Word", "caps_word", "caps_word");
demoBehavior(12, "Sticky Key", "sk", "sticky_key", [
  { param1: [key], param2: [] },
]);
demoBehavior(13, "Mouse Key Press", "mkp", "mouse_key_press", [
  {
    param1: [1, 2, 4, 8, 16].map((v, i) => ({
      name: "MB" + (i + 1),
      constant: v,
    })),
    param2: [],
  },
]);
demoBehavior(14, "Output Selection", "out", "outputs", [
  {
    param1: commands("Toggle output", "USB output", "BLE output", "No output"),
    param2: [],
  },
]);
demoBehavior(15, "Underglow", "rgb_ug", "rgb_underglow", [
  {
    param1: [{ name: "Set color", constant: 14 }],
    param2: [{ name: "Color", hsb: {} }],
  },
]);

function demoEncoders(layer: number) {
  const dir = (code?: number) => ({
    overridden: false,
    binding: code ? { behaviorId: 1, param1: code, param2: 0 } : undefined,
  });
  return {
    encoders:
      layer === 0
        ? [
            { clockwise: dir(0xc00e9), counterclockwise: dir(0xc00ea) },
            { clockwise: dir(0x7004e), counterclockwise: dir(0x7004b) },
          ]
        : Array.from({ length: 2 }, () => ({
            clockwise: dir(),
            counterclockwise: dir(),
          })),
  };
}

function geometry(split: boolean): PhysicalLayout {
  return {
    name: split ? "Split" : "Compact",
    keys: Array.from({ length: 36 }, (_, i) => {
      const row = Math.floor(i / 10);
      const column = (i % 10) + (row === 3 ? 2 : 0);
      return {
        x: column * 100 + (split && column >= 5 ? 150 : 0),
        y: row * 100 + (split ? [20, 10, 0, 10, 20][column % 5] : 0),
        width: 100,
        height: 100,
        r: 0,
        rx: 0,
        ry: 0,
      };
    }),
  };
}

export function createDemoConnection(): RpcConnection {
  const transparent = { behaviorId: 4, param1: 0, param2: 0 };
  const letters = Array.from(
    "QWERTYUIOPASDFGHJKL",
    (c) => c.charCodeAt(0) - 61,
  );
  const usages = [
    ...letters,
    51,
    ...Array.from("ZXCVBNM", (c) => c.charCodeAt(0) - 61),
    54,
    55,
    56,
    41,
    44,
    43,
    44,
    40,
    42,
  ];
  const bindings = usages.map((id) => ({
    behaviorId: 1,
    param1: 0x70000 + id,
    param2: 0,
  }));
  bindings[30] = { behaviorId: 2, param1: 0x700e0, param2: 0x70029 };
  bindings[33] = { behaviorId: 3, param1: 1, param2: 0 };
  const stock: Keymap = {
    availableLayers: 2,
    maxLayerNameLength: 16,
    layers: [
      { id: 0, name: "Base", bindings },
      {
        id: 1,
        name: "Nav",
        bindings: bindings.map((_, i) =>
          i >= 16 && i <= 19
            ? {
                behaviorId: 1,
                param1: 0x70000 + [80, 81, 82, 79][i - 16],
                param2: 0,
              }
            : transparent,
        ),
      },
    ],
  };
  for (const layer of stock.layers) layer.encoderMap = demoEncoders(layer.id);
  let saved = structuredClone(stock);
  let map = structuredClone(stock);
  let active = 0,
    savedLayout = 0;
  const removed = new Map<number, Layer>();
  const dirty = () =>
    active !== savedLayout || JSON.stringify(map) !== JSON.stringify(saved);
  let notify!: ReadableStreamDefaultController<Notification>;
  let respond!: ReadableStreamDefaultController<RequestResponse>;
  const notification_readable = new ReadableStream<Notification>({
    start(c) {
      notify = c;
    },
  });
  const request_response_readable = new ReadableStream<RequestResponse>({
    start(c) {
      respond = c;
    },
  });
  const lighting = demoLighting();
  function handle(req: Request): Omit<RequestResponse, "requestId"> {
    if (req.lighting) {
      const result = lighting(req.lighting);
      if (req.lighting.set && result.state)
        notify.enqueue({ lighting: { stateChanged: true } });
      return { lighting: result };
    }
    const k = req.keymap;
    if (req.core?.getDeviceInfo)
      return {
        core: {
          getDeviceInfo: {
            name: "Demo keyboard",
            serialNumber: Uint8Array.of(1),
            lightingSupport: LightingSupport.LED_MATRIX,
          },
        },
      };
    if (req.core?.getLockState)
      return {
        core: { getLockState: LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED },
      };
    if (req.core?.resetSettings) {
      map = structuredClone(stock);
      saved = structuredClone(stock);
      active = savedLayout = 0;
      return { core: { resetSettings: true } };
    }
    if (req.behaviors?.listAllBehaviors)
      return {
        behaviors: {
          listAllBehaviors: { behaviors: behaviors.map((b) => b.id) },
        },
      };
    if (req.behaviors?.getBehaviorDetails)
      return {
        behaviors: {
          getBehaviorDetails: behaviors.find(
            (b) => b.id === req.behaviors!.getBehaviorDetails!.behaviorId,
          ),
        },
      };
    if (k?.getPhysicalLayouts)
      return {
        keymap: {
          getPhysicalLayouts: {
            activeLayoutIndex: active,
            layouts: [geometry(true), geometry(false)],
          },
        },
      };
    if (k?.getKeymap) return { keymap: { getKeymap: map } };
    if (k?.checkUnsavedChanges)
      return { keymap: { checkUnsavedChanges: dirty() } };
    if (k?.setActivePhysicalLayout !== undefined) {
      active = k.setActivePhysicalLayout;
      return { keymap: { setActivePhysicalLayout: { ok: map } } };
    }
    if (k?.setEncoderBinding) {
      const { layerId, sensorIndex, counterclockwise, binding, restore } =
        k.setEncoderBinding;
      const encoder = map.layers.find((l) => l.id === layerId)?.encoderMap
        ?.encoders[sensorIndex];
      if (!encoder) return { keymap: { setEncoderBinding: 1 } };
      const side = counterclockwise ? "counterclockwise" : "clockwise";
      if (binding) {
        const behavior = behaviors.find((b) => b.id === binding.behaviorId);
        if (!behavior || behavior.bindingType?.sensorOnly)
          return { keymap: { setEncoderBinding: 2 } };
        if (
          !accepts(
            behavior,
            map.layers.map((l) => l.id),
            binding,
          )
        )
          return { keymap: { setEncoderBinding: 3 } };
        encoder[side] = { binding, overridden: true };
      } else if (restore)
        encoder[side] = demoEncoders(layerId).encoders[sensorIndex][side];
      else return { keymap: { setEncoderBinding: 3 } };
      return { keymap: { setEncoderBinding: 0 } };
    }
    if (k?.setLayerBinding) {
      const { layerId, keyPosition, binding } = k.setLayerBinding;
      const layer = map.layers.find((l) => l.id === layerId);
      if (!layer?.bindings[keyPosition] || !binding)
        return { keymap: { setLayerBinding: 1 } };
      const behavior = behaviors.find((b) => b.id === binding.behaviorId);
      if (!behavior || behavior.bindingType?.sensorOnly)
        return { keymap: { setLayerBinding: 2 } };
      if (
        !accepts(
          behavior,
          map.layers.map((l) => l.id),
          binding,
        )
      )
        return { keymap: { setLayerBinding: 3 } };
      layer.bindings[keyPosition] = binding;
      return { keymap: { setLayerBinding: 0 } };
    }
    if (k?.saveChanges) {
      saved = structuredClone(map);
      savedLayout = active;
      return { keymap: { saveChanges: { ok: true } } };
    }
    if (k?.discardChanges) {
      map = structuredClone(saved);
      active = savedLayout;
      return { keymap: { discardChanges: true } };
    }
    if (k?.setLayerProps) {
      map.layers.find((l) => l.id === k.setLayerProps!.layerId)!.name =
        k.setLayerProps.name;
      return { keymap: { setLayerProps: 0 } };
    }
    if (k?.moveLayer) {
      const [l] = map.layers.splice(k.moveLayer.startIndex, 1);
      map.layers.splice(k.moveLayer.destIndex, 0, l);
      return { keymap: { moveLayer: { ok: map } } };
    }
    if (k?.addLayer) {
      const id = [0, 1, 2, 3].find((i) => !map.layers.some((l) => l.id === i));
      if (id === undefined) return { keymap: { addLayer: { err: 2 } } };
      const layer = {
        id,
        name: "",
        encoderMap: demoEncoders(id),
        bindings: bindings.map(() => transparent),
      };
      map.availableLayers--;
      map.layers.push(layer);
      return {
        keymap: { addLayer: { ok: { layer, index: map.layers.length - 1 } } },
      };
    }
    if (k?.removeLayer) {
      const [layer] = map.layers.splice(k.removeLayer.layerIndex, 1);
      removed.set(layer.id, layer);
      map.availableLayers++;
      return { keymap: { removeLayer: { ok: {} } } };
    }
    if (k?.restoreLayer) {
      const layer = removed.get(k.restoreLayer.layerId)!;
      map.layers.splice(k.restoreLayer.atIndex, 0, layer);
      map.availableLayers--;
      return { keymap: { restoreLayer: { ok: layer } } };
    }
    throw Error("Unsupported demo operation.");
  }
  const request_writable = new WritableStream<Request>({
    write(request) {
      const wasDirty = dirty();
      respond.enqueue(
        structuredClone({ requestId: request.requestId, ...handle(request) }),
      );
      if (wasDirty !== dirty())
        notify.enqueue({ keymap: { unsavedChangesStatusChanged: dirty() } });
    },
    close() {
      respond.close();
      notify.close();
    },
  });
  return {
    label: "Demo",
    current_request: 0,
    notification_readable,
    request_response_readable,
    request_writable,
  };
}
