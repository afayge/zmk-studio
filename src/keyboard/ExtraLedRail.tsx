import { useMemo, useRef } from "react";
import type { Catalog, State } from "../rpc/generated/lighting";
import { Kind, unassigned, type Directory } from "../rpc/lightingEditor";
import type { MatrixLighting, SideLighting } from "../rpc/useMatrixLighting";
import { makePreview, type PreviewGrid } from "./matrixPreview";
import { useKeyLights } from "./useKeyLights";

export type ExtraLedEdit = {
  side: number;
  directory: Directory;
  groupKey: number;
  members: number[];
  disabled: boolean;
  change: (members: number[]) => void;
};

function extraGroups(directory: Directory, keyCount: number) {
  const groups = new Map<number, number[]>();
  directory.topology?.leds.forEach(({ position, owner }, led) => {
    if (position !== unassigned && position < keyCount) return;
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner)!.push(led);
  });
  return groups;
}

function physicalSide(board?: string) {
  const words = board?.toLowerCase().split(/[^a-z]+/);
  if (words?.includes("left") || words?.includes("l")) return "left";
  if (words?.includes("right") || words?.includes("r")) return "right";
}

// The animation clock also drives the keyboard. Side lights have no physical key coordinates.
const noKeys: PreviewGrid = { points: [], rows: 0, cols: 0 };

export function ExtraLedRail({
  flank,
  lighting,
  keyCount,
  edit,
}: {
  flank: "left" | "right";
  lighting: MatrixLighting;
  keyCount: number;
  edit?: ExtraLedEdit;
}) {
  const { sideGroups, catalog, state } = lighting;
  if (!catalog || !state) return null;
  const sides = new Map(sideGroups.map((s) => [s.side, s]));
  if (edit && !sides.has(edit.side))
    sides.set(edit.side, { side: edit.side, zones: new Map() });
  const primaryFlank = physicalSide(sides.get(0)?.directory?.board);
  const opposite = primaryFlank === "right" ? "left" : "right";
  const boards = Array.from(sides.values()).map((side) => {
    const active = edit?.side === side.side ? edit : undefined;
    const directory = active?.directory ?? side.directory;
    if (!directory) return null;
    const location = !catalog.peripheralSlots
      ? "right"
      : physicalSide(directory.board) ??
        (side.side === 0
          ? physicalSide(sides.get(1)?.directory?.board) === "left"
            ? "right"
            : "left"
          : opposite);
    if (location !== flank) return null;
    const groups = extraGroups(directory, keyCount);
    if (!groups.size) return null;
    const name =
      directory.board ||
      (side.side === 0 ? "Connected side" : `Peripheral ${side.side}`);
    return (
      <section key={side.side} aria-label={name} className="extra-led-board">
        <strong>{name}</strong>
        {Array.from(groups, ([owner, leds]) => {
          const label =
            owner === unassigned
              ? "Extra LEDs"
              : directory.groups.find(
                  (g) => g.key >> 8 === ((Kind.Zone << 8) | owner),
                )?.label || `Zone ${owner + 1}`;
          return (
            <ExtraLedGroup
              key={owner}
              {...{ catalog, state, side, owner, label, leds }}
              edit={active}
            />
          );
        })}
      </section>
    );
  });
  return boards.some(Boolean) ? (
    <aside
      className={`extra-led-rail ${flank}`}
      aria-label={`${flank === "left" ? "Left" : "Right"} side lights`}
    >
      {boards}
    </aside>
  ) : null;
}

function ExtraLedGroup({
  catalog,
  state,
  side,
  owner,
  label,
  leds,
  edit,
}: {
  catalog: Catalog;
  state: State;
  side: SideLighting;
  owner: number;
  label: string;
  leds: number[];
  edit?: ExtraLedEdit;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const zone = owner !== unassigned;
  const group = zone ? side.zones.get(owner) : side.group;
  const { source, topology, activeLayer, status } = side;
  const effect = useMemo(
    () =>
      source
        ? makePreview(
            catalog,
            state,
            group,
            topology,
            activeLayer,
            Infinity,
            status,
          )
        : undefined,
    [source, catalog, state, group, topology, activeLayer, status],
  );
  const ids = leds.join(",");
  useKeyLights(ref, noKeys, effect || undefined, ids, zone ? "zone" : "main");
  const occupied =
    zone &&
    edit &&
    edit.groupKey >> 16 === Kind.Zone &&
    ((edit.groupKey >> 8) & 255) !== owner;
  return (
    <div className="extra-led-group" role="group" aria-label={label} ref={ref}>
      <span>{label}</span>
      <div>
        {leds.map((led) => {
          const selected = edit?.members.includes(led);
          const unknown = status?.has(led)
            ? status.get(led)?.value === undefined
            : source === undefined ||
              (!!source && zone && !group && !activeLayer?.leds.includes(led));
          const light = (
            <i
              aria-hidden="true"
              data-extra-led={led}
              data-unknown={unknown || undefined}
            />
          );
          const name = `Extra LED ${led}${occupied ? " · " + label : ""}`;
          return (
            <span
              className="extra-led"
              key={led}
              title={
                unknown ? `LED ${led} · Preview unavailable` : `LED ${led}`
              }
            >
              {light}
              {edit ? (
                <button
                  type="button"
                  aria-label={name}
                  aria-pressed={selected}
                  disabled={edit.disabled || (occupied && !selected)}
                  onClick={() =>
                    edit.change(
                      selected
                        ? edit.members.filter((id) => id !== led)
                        : [...edit.members, led],
                    )
                  }
                >
                  {led}
                </button>
              ) : (
                <span aria-label={name}>{led}</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
