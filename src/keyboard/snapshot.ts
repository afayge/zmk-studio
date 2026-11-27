import type {
  BehaviorBinding,
  Keymap,
  PhysicalLayout,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { accepts, DeviceBehavior, sameBinding } from "../behaviors/actions";

export interface BindingChange {
  layerId: number;
  position: number;
  before: BehaviorBinding;
  after: BehaviorBinding;
}

export interface SnapshotContext {
  device: string;
  layout: PhysicalLayout;
  keymap: Keymap;
  behaviors: Record<number, DeviceBehavior>;
}

export function layoutSignature(layout: PhysicalLayout) {
  return JSON.stringify([
    layout.name,
    layout.keys.map((k) => [k.x, k.y, k.width, k.height, k.r, k.rx, k.ry]),
  ]);
}

export function snapshot({
  device,
  layout,
  keymap,
  behaviors,
}: SnapshotContext) {
  return {
    format: "zmk-studio-bindings",
    version: 1,
    device,
    layout: layoutSignature(layout),
    layers: keymap.layers.map((l) => ({
      id: l.id,
      name: l.name,
      bindings: l.bindings.map((b) => ({
        ...b,
        behaviorName: behaviors[b.behaviorId]?.displayName,
      })),
    })),
  };
}

type Snapshot = ReturnType<typeof snapshot>;

export function previewSnapshot(json: string, context: SnapshotContext) {
  const errors: string[] = [];
  const changes: BindingChange[] = [];
  const file: Snapshot = JSON.parse(json);
  if (!file || file.format !== "zmk-studio-bindings" || file.version !== 1)
    throw Error("Unsupported keymap snapshot.");
  if (file.device !== context.device)
    throw Error("This snapshot belongs to another keyboard.");
  if (file.layout !== layoutSignature(context.layout))
    throw Error("Select the matching physical layout before restoring.");
  const ids = context.keymap.layers.map((l) => l.id);
  if (
    !Array.isArray(file.layers) ||
    file.layers.length !== ids.length ||
    file.layers.some((l, i) => l?.id !== ids[i])
  )
    throw Error("The layer IDs or order differ from the current keyboard.");
  for (const [index, layer] of file.layers.entries()) {
    const current = context.keymap.layers[index];
    if (
      !Array.isArray(layer.bindings) ||
      layer.bindings.length !== current.bindings.length
    ) {
      errors.push(
        `Layer ${current.name || current.id} has a different number of keys.`,
      );
      continue;
    }
    layer.bindings.forEach((b, position) => {
      const behavior = b && context.behaviors[b.behaviorId];
      if (
        !behavior ||
        b.behaviorName !== behavior.displayName ||
        ![b.behaviorId, b.param1, b.param2].every(
          (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff,
        ) ||
        !accepts(behavior, ids, b)
      ) {
        errors.push(
          `${current.name || current.id}, key ${position + 1}: incompatible behavior, parameter or layer reference.`,
        );
      } else if (!sameBinding(current.bindings[position], b)) {
        const { behaviorId, param1, param2 } = b;
        changes.push({
          layerId: layer.id,
          position,
          before: current.bindings[position],
          after: { behaviorId, param1, param2 },
        });
      }
    });
  }
  return { changes, errors };
}
