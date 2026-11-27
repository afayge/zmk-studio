import {
  Field,
  Kind,
  type Directory,
  type Values,
  lightingEditor,
} from "./lightingEditor";

export type PresetRequest = {
  action: "create" | "copy" | "rename" | "delete" | "restore";
  source: number;
  side: number;
  name: string;
};
type Target = { board: string; revision: number; values: Values };
export type PresetOperation = {
  request: PresetRequest;
  submitted?: boolean;
  key?: number;
  targets?: Target[];
  fallback?: number;
};
type Client = ReturnType<typeof lightingEditor>;
const equal = (a: Values, b: Values) => JSON.stringify(a) === JSON.stringify(b);
const prefix = Kind.Main << 16;

export function customMain(key: number, directory: Directory) {
  const slots = directory.mainSlots,
    id = key & 255;
  return (
    key >> 16 === Kind.Main &&
    !!slots &&
    id >= slots.first &&
    id < slots.first + slots.count
  );
}

// The journal contains the intended values and original revision on every side
// before the first write. A lost acknowledgment is reconciled by reading the side.
export async function applyMainOperation(
  operation: PresetOperation,
  clients: Client[],
  remember: (op: PresetOperation) => void,
  selectFallback: (removed: number, fallback: number) => Promise<void>,
) {
  const directories: Directory[] = [];
  for (const client of clients) {
    const d = await client.directory();
    if (!d.mainSlots)
      throw Error("Update every keyboard side to manage shared main presets.");
    directories.push(d);
  }
  const { action, source, side, name } = operation.request;
  if (!operation.targets) {
    const creating = action === "create" || action === "copy";
    if (
      action !== "restore" &&
      action !== "delete" &&
      (!name.trim() || new TextEncoder().encode(name).length > 63)
    )
      throw Error("Use a preset name of 1–63 UTF-8 bytes.");
    let key = source;
    if (creating) {
      const slots = directories[0].mainSlots!;
      const free = Array.from(
        { length: slots.count },
        (_, i) => prefix | (slots.first + i),
      ).find((k) =>
        directories.every(
          (d) => customMain(k, d) && !d.groups.some((g) => g.key === k),
        ),
      );
      if (free === undefined)
        throw Error("No free main preset slot is available on every side.");
      key = free;
    }
    if (action === "delete" && !directories.every((d) => customMain(key, d)))
      throw Error("Only custom main presets can be deleted.");
    const factoryName =
      action === "restore"
        ? (await clients[side].factoryGroup(key)).values[Field.Name]
        : name.trim();
    const targets: Target[] = [];
    for (const [i, client] of clients.entries()) {
      const target = await client.group(key);
      if (creating && target.values[Field.Disabled] !== 1)
        throw Error("The selected slot is already in use.");
      if (!creating && target.values[Field.Disabled])
        throw Error("This preset was removed on another side.");
      let values: Values = { ...target.values, [Field.Name]: factoryName };
      if (action === "delete" || (action === "restore" && i === side))
        values = (await client.factoryGroup(key)).values;
      if (creating) {
        const initial =
          action === "copy"
            ? await client.group(source)
            : await client.factoryGroup(key);
        if (action === "copy" && initial.values[Field.Disabled])
          throw Error("The source preset is unavailable.");
        values = {
          ...initial.values,
          [Field.Name]: name.trim(),
          [Field.Disabled]: 0,
        };
      }
      targets.push({
        board: directories[i].board,
        revision: target.revision,
        values,
      });
    }
    const alternatives = directories[0].groups
      .filter(
        (g) =>
          g.key >> 16 === Kind.Main &&
          g.key !== key &&
          directories.every((d) => d.groups.some((e) => e.key === g.key)),
      )
      .sort((a, b) => a.key - b.key);
    operation = { ...operation, key, targets, fallback: alternatives[0]?.key };
    remember(operation);
  }
  const { key, targets, fallback } = operation;
  if (
    key === undefined ||
    !targets ||
    targets.length !== clients.length ||
    targets.some((t, i) => t.board !== directories[i].board)
  )
    throw Error("Reconnect the original keyboard sides to finish this change.");
  // Preflight all revisions before changing any side, including on recovery.
  for (const [i, client] of clients.entries()) {
    const g = await client.group(key);
    if (
      !equal(g.values, targets[i].values) &&
      g.revision !== targets[i].revision
    )
      throw Error(
        "This preset changed on the keyboard. Review it before starting a new operation.",
      );
  }
  if (action === "delete" && fallback !== undefined)
    await selectFallback(key & 255, fallback & 255);
  for (let i = clients.length - 1; i >= 0; i--) {
    const g = await clients[i].group(key),
      target = targets[i];
    if (equal(g.values, target.values)) continue;
    if (g.revision !== target.revision)
      throw Error("This preset changed during the operation.");
    const saved = await clients[i].save(
      key,
      g.revision,
      action === "delete" || (action === "restore" && i === side)
        ? undefined
        : target.values,
    );
    if (!equal(saved.values, target.values))
      throw Error("Preset readback differs from the requested values.");
  }
  return key;
}
