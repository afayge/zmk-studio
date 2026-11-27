import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { Catalog } from "../rpc/generated/lighting";
import type { DeviceBehavior } from "./actions";
import {
  matrixAvailable,
  matrixChoices,
  matrixCommands,
  statusSources,
} from "./matrixActions";

export function MatrixBindingPicker({
  behavior,
  binding,
  catalog,
  change,
}: {
  behavior: DeviceBehavior;
  binding: BehaviorBinding;
  catalog?: Catalog;
  change: (b: BehaviorBinding) => void;
}) {
  const command = binding.param1,
    n = binding.param2;
  const commands = new Map(
    behavior.metadata
      .flatMap((s) => s.param1)
      .flatMap((p) =>
        p.constant === undefined ||
        !matrixAvailable(p.constant, catalog) ||
        (matrixCommands[p.constant] &&
          !matrixChoices(behavior, p.constant, catalog).size)
          ? []
          : [
              [
                p.constant,
                matrixCommands[p.constant]?.label ?? p.name,
              ] as const,
            ],
      ),
  );
  const choices = matrixChoices(behavior, command, catalog),
    parameter = matrixCommands[command]?.parameter;
  const set = (value: number) => change({ ...binding, param2: value });
  function select(
    label: string,
    value: number,
    options: Map<number, string>,
    onChange: (n: number) => void,
  ) {
    return (
      <label className="lighting-control">
        {label}
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {!options.has(value) && (
            <option value={value} disabled>
              Unavailable ({value})
            </option>
          )}
          {Array.from(options, ([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const zones = new Map<number, string>(),
    presets = new Map<number, string>();
  if (parameter === "zonePreset") {
    for (const [packed, name] of choices) {
      const id = packed >>> 8;
      zones.set(
        id,
        catalog?.zones.find((z) => z.id === id)?.name || `Zone ${id + 1}`,
      );
      if (id === n >>> 8)
        presets.set(
          packed,
          name === "0" ? `Preset ${(packed & 255) + 1}` : name,
        );
    }
  }
  return (
    <div className="matrix-binding-fields">
      {select("LED Matrix command", command, commands, (id) =>
        change({
          ...binding,
          param1: id,
          param2: matrixChoices(behavior, id, catalog).keys().next().value ?? 0,
        }),
      )}
      {parameter === "brightness" && (
        <label className="lighting-control">
          Brightness (%)
          <input
            type="number"
            min={0}
            max={100}
            value={Number.isFinite(n) ? n : ""}
            onChange={(e) => set(e.target.valueAsNumber)}
          />
        </label>
      )}
      {parameter === "status" && (
        <fieldset>
          <legend>Status sources</legend>
          <label>
            <input
              type="checkbox"
              checked={n === 0}
              onChange={(e) => set(e.target.checked ? 0 : 15)}
            />{" "}
            All sources (automatic)
          </label>
          {statusSources.map((source, i) => (
            <label key={source}>
              <input
                type="checkbox"
                checked={!!(n & (1 << i))}
                onChange={(e) =>
                  set(e.target.checked ? n | (1 << i) : n & ~(1 << i))
                }
              />{" "}
              {source}
            </label>
          ))}
        </fieldset>
      )}
      {parameter === "zonePreset" && (
        <>
          {select("Lighting zone", n >>> 8, zones, (id) => {
            const first = [...choices.keys()].find((v) => v >>> 8 === id);
            if (first !== undefined) set(first);
          })}
          {select("Zone preset", n, presets, set)}
        </>
      )}
      {parameter &&
        ["zone", "preset", "speed", "hue"].includes(parameter) &&
        select(
          (
            {
              zone: "Lighting zone",
              preset: "Main preset",
              speed: "Animation speed",
              hue: "Palette hue",
            } as Record<string, string>
          )[parameter],
          n,
          choices,
          set,
        )}
    </div>
  );
}
