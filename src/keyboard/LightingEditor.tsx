import { readStorage, writeStorage } from "./lightingStorage";
import { FirmwareColorPicker } from "./FirmwareColorPicker";
import {
  Activity,
  Battery,
  Bluetooth,
  CaseUpper,
  Clock,
  Combine,
  Grid2X2,
  Hash,
  Languages,
  Layers,
  Palette,
  ScrollText,
  Usb,
} from "lucide-react";
import type { Catalog } from "../rpc/generated/lighting";
import { LightingChoiceGrid, type LightingChoice } from "./LightingChoiceGrid";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyMainOperation,
  customMain,
  type PresetOperation,
  type PresetRequest,
} from "../rpc/mainPresets";
import { call_rpc } from "../rpc/logging";
import { createPortal } from "react-dom";
import {
  LedCanvas,
  LedCanvasNotice,
  LedPositionPicker,
} from "./LedPositionPicker";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import {
  Field,
  Kind,
  inherit,
  lightingEditor,
  rendererNames,
  effectStyles,
  reversibleEffects,
  withMembers,
  type Directory,
  type Group,
  type Values,
} from "../rpc/lightingEditor";

type Client = ReturnType<typeof lightingEditor>;
type Layer = { id: number; name: string };
type Draft = { base: number; values: Values; pending?: "apply" | "restore" };
type Live = Awaited<ReturnType<Client["live"]>>;
const sources = ["Battery", "USB", "Bluetooth", "Lock keys"];
const locks = ["Num Lock", "Caps Lock", "Scroll Lock", "Compose", "Kana"];
const categories = [
  { id: Kind.Main, name: "Main presets", icon: Palette },
  { id: Kind.Zone, name: "Independent zones", icon: Grid2X2 },
  { id: Kind.Layer, name: "Layer colors", icon: Layers },
  { id: Kind.Indicator, name: "Status indicators", icon: Activity },
  { id: Kind.Timing, name: "Timing", icon: Clock },
] satisfies LightingChoice[];
const indicatorIcons = [
  Battery,
  Usb,
  Bluetooth,
  CaseUpper,
  Hash,
  ScrollText,
  Combine,
  Languages,
];
type EditTarget = Directory["groups"][number] & {
  side: number;
  creating: boolean;
  editing: boolean;
};
type ActiveTarget = React.MutableRefObject<EditTarget | undefined>;
type Navigation = {
  kind?: Kind;
  keys: Partial<Record<Kind, number>>;
  newZone?: number;
};
const sourceNames = [
  "Off",
  "Main preset",
  "Independent zone",
  "Layer color",
  "Status indicator",
];
const same = (a: Values, b: Values) => JSON.stringify(a) === JSON.stringify(b);
const layerName = (layers: Layer[], id: number) =>
  layers.find((l) => l.id === id)?.name || `Layer ${id}`;

export function LightingEditor({
  conn,
  prefix,
  side,
  selectSide,
  layers,
  catalog,
  colorRevision,
  onSaved,
}: {
  conn: RpcConnection;
  prefix: string;
  side: number;
  selectSide: (side: number) => void;
  layers: Layer[];
  catalog: Catalog;
  colorRevision: number;
  onSaved: () => void;
}) {
  const canvas = useContext(LedCanvas);
  const layoutIndex = canvas?.index ?? 0;
  const activeTarget = useRef<EditTarget>();
  const slots = catalog.peripheralSlots;
  const [boards, setBoards] = useState<Record<number, string>>({});
  const clients = useMemo(
    () => Array.from({ length: slots + 1 }, (_, n) => lightingEditor(conn, n)),
    [conn, slots],
  );
  const api = clients[side];
  const discovered = useCallback(
    (name: string) =>
      setBoards((old) => (old[side] === name ? old : { ...old, [side]: name })),
    [side],
  );
  return (
    <section className="lighting-editor" aria-label="Advanced lighting">
      <h3>Effects and indicators</h3>
      {slots > 0 &&
        canvas?.sideToolbar &&
        createPortal(
          <div
            role="group"
            aria-label="Keyboard side"
            className="lighting-side-switch"
          >
            <span>Keyboard side</span>
            {clients.map((_, i) => (
              <button
                type="button"
                className="studio-button"
                key={i}
                aria-pressed={side === i}
                onClick={() => selectSide(i)}
              >
                {boards[i] || (i === 0 ? "Connected side" : `Peripheral ${i}`)}
              </button>
            ))}
          </div>,
          canvas.sideToolbar,
        )}
      <SideEditor
        key={JSON.stringify([prefix, side, layoutIndex, colorRevision])}
        api={api}
        activeTarget={activeTarget}
        catalog={side === 0 ? catalog : undefined}
        management={{
          clients,
          side,
          conn,
          storage: prefix + ":main-operation",
        }}
        prefix={prefix + ":" + side}
        layers={layers}
        discovered={discovered}
        onSaved={onSaved}
      />
    </section>
  );
}

function isCustom(key: number, directory: Directory) {
  const zone = (key >> 8) & 255,
    t = directory.topology;
  return (
    key >> 16 === Kind.Zone &&
    !!t &&
    zone >= t.firstCustom &&
    zone < t.firstCustom + t.capacity
  );
}

type Management = {
  clients: Client[];
  side: number;
  conn: RpcConnection;
  storage: string;
};

function SideEditor({
  activeTarget,
  management,
  catalog,
  api,
  prefix,
  layers,
  discovered,
  onSaved,
}: {
  activeTarget: ActiveTarget;
  management: Management;
  catalog?: Catalog;
  api: Client;
  prefix: string;
  layers: Layer[];
  discovered: (board: string) => void;
  onSaved?: () => void;
}) {
  const [missing, setMissing] = useState<EditTarget>();
  const [editing, setEditing] = useState(false);
  const itemPicker = useRef<HTMLDivElement>(null);
  const [formVersion, bumpForm] = useState(0);
  const layoutIndex = useContext(LedCanvas)?.index ?? 0;
  const [directory, setDirectory] = useState<Directory>(),
    [attempt, retry] = useState(0),
    [error, setError] = useState("");
  const [navigation, setNavigation] = useState<Navigation>({ keys: {} }),
    [offline, setOffline] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const target = activeTarget.current;
    setDirectory(undefined);
    setError("");
    setOffline(false);
    api
      .directory(controller.signal, layoutIndex)
      .then((d) => {
        if (controller.signal.aborted) return;
        discovered(d.board);
        setDirectory(d);
        const storage = prefix + d.board;
        const saved = readStorage<Navigation>(storage + ":navigation");
        const legacy = readStorage<number>(storage + ":group");
        const initial: Navigation = { keys: {} };
        if (legacy !== undefined) {
          initial.kind = legacy >> 16;
          initial.keys[initial.kind] = legacy;
          if (
            isCustom(legacy, d) &&
            !d.groups.some((g) => g.key === legacy) &&
            readStorage(storage + ":" + legacy)
          )
            initial.newZone = legacy;
        }
        const nav = saved ?? initial;
        if (!target) {
          setNavigation(nav);
          setMissing(undefined);
          setEditing(
            nav.kind === Kind.Zone &&
              nav.newZone !== undefined &&
              nav.keys[Kind.Zone] === nav.newZone,
          );
          return;
        }
        const kind = target.key >> 16;
        const entry = d.groups.find((g) => g.key === target.key);
        const pendingHere =
          target.creating &&
          target.side === management.side &&
          nav.newZone === target.key &&
          isCustom(target.key, d) &&
          !entry;
        const matches =
          pendingHere ||
          (!!entry &&
            (kind !== Kind.Zone ||
              (!target.creating &&
                (target.side === management.side ||
                  (!!entry.label &&
                    !!entry.profile &&
                    entry.label === target.label &&
                    entry.profile === target.profile)))) &&
            (kind !== Kind.Layer ||
              !d.mainSlots ||
              layers.some((l) => l.id === (target.key & 255))));
        setMissing(matches ? undefined : target);
        setEditing(target.editing);
        setNavigation({
          ...nav,
          kind,
          keys: matches ? { ...nav.keys, [kind]: target.key } : nav.keys,
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [
    api,
    prefix,
    attempt,
    discovered,
    layoutIndex,
    management.side,
    layers,
    activeTarget,
  ]);
  const refreshDirectory = useCallback(async () => {
    const next = await api.directory(undefined, layoutIndex);
    setDirectory(next);
    return next;
  }, [api, layoutIndex]);
  useEffect(() => {
    if (directory)
      writeStorage(prefix + directory.board + ":navigation", navigation);
  }, [directory, prefix, navigation]);
  const unavailable = useCallback(() => setOffline(true), []);
  if (error)
    return (
      <LedCanvasNotice>
        <div role="alert">
          {error}{" "}
          <button className="studio-button" onClick={() => retry((n) => n + 1)}>
            Retry side
          </button>
        </div>
      </LedCanvasNotice>
    );
  if (!directory) return <LedCanvasNotice>Reading this side…</LedCanvasNotice>;
  const storage = prefix + directory.board;
  const topology = directory.topology;
  const availableKey =
    topology &&
    Array.from(
      { length: topology.capacity },
      (_, i) => (Kind.Zone << 16) | ((topology.firstCustom + i) << 8),
    ).find((key) => !directory.groups.some((g) => g.key === key));
  const entries = directory.groups.filter(
    (g) =>
      g.key >> 16 !== Kind.Layer ||
      !directory.mainSlots ||
      layers.some((layer) => layer.id === (g.key & 255)),
  );
  const newZone = navigation.newZone;
  const pendingZone =
    newZone !== undefined &&
    isCustom(newZone, directory) &&
    !entries.some((g) => g.key === newZone)
      ? newZone
      : undefined;
  if (pendingZone !== undefined)
    entries.push({
      key: pendingZone,
      label: "New independent group",
      profile: "",
    });
  const visibleCategories = categories.filter(
    ({ id }) =>
      entries.some((g) => g.key >> 16 === id) ||
      (id === Kind.Main &&
        directory.mainSlots &&
        directory.mainSlots.count > 0) ||
      (id === Kind.Zone && topology && topology.capacity > 0),
  );
  const category =
    visibleCategories.find((c) => c.id === navigation.kind) ??
    visibleCategories[0];
  const kind = category?.id;
  const items = entries.filter((g) => g.key >> 16 === kind);
  const remembered = kind === undefined ? undefined : navigation.keys[kind];
  const selected = missing
    ? undefined
    : items.find((g) => g.key === remembered)?.key ?? items[0]?.key;
  const creating = pendingZone !== undefined && selected === pendingZone;
  const choose = (key: number, create = false) => {
    setEditing(create || key === pendingZone || !!missing?.editing);
    activeTarget.current = undefined;
    setMissing(undefined);
    setNavigation((previous) => ({
      ...previous,
      kind: key >> 16,
      keys: { ...previous.keys, [key >> 16]: key },
      newZone: create ? key : previous.newZone,
    }));
  };
  const label = (key: number, name: string, profile: string) => {
    const kind = key >> 16,
      id = key & 255;
    if (key === pendingZone) return name;
    if (kind === Kind.Zone)
      return `${name || "Zone " + ((key >> 8) & 255)} · ${profile || "Preset " + (id + 1)}`;
    if (kind === Kind.Layer)
      return layerName(layers, id) === `Layer ${id}` && name
        ? name
        : layerName(layers, id);
    return name || `Preset ${id + 1}`;
  };
  return (
    <>
      <LiveStatus
        api={api}
        mask={directory.sources}
        layers={layers}
        unavailable={unavailable}
      />
      {offline && (
        <button className="studio-button" onClick={() => retry((n) => n + 1)}>
          Reconnect and read side
        </button>
      )}
      {missing && (
        <LedCanvasNotice>
          {missing.creating
            ? "New independent group"
            : label(missing.key, missing.label, missing.profile)}{" "}
          is unavailable on {directory.board}.
          <button
            type="button"
            className="studio-button"
            onClick={() => {
              const picker = itemPicker.current;
              const input = picker?.querySelector<HTMLInputElement>(
                "fieldset:nth-of-type(2) input, fieldset:only-of-type input",
              );
              input?.focus();
              picker?.scrollIntoView({ block: "nearest" });
            }}
          >
            Choose an item on this side
          </button>
        </LedCanvasNotice>
      )}
      <div ref={itemPicker} className="lighting-item-picker">
        <LightingChoiceGrid
          label="Edit group"
          choices={visibleCategories}
          value={kind}
          onChange={(kind) => {
            if (!missing) {
              activeTarget.current = undefined;
              setEditing(
                kind === Kind.Zone &&
                  pendingZone !== undefined &&
                  navigation.keys[Kind.Zone] === pendingZone,
              );
            }
            setNavigation((previous) => ({ ...previous, kind }));
          }}
        />
        {category && (
          <LightingChoiceGrid
            label={category.name}
            value={selected}
            onChange={choose}
            choices={items.map((g) => {
              const id = g.key & 255;
              const profiles =
                kind === Kind.Zone
                  ? catalog?.zones.find((z) => z.id === ((g.key >> 8) & 255))
                      ?.profiles
                  : catalog?.profiles;
              const renderer =
                kind === Kind.Main || kind === Kind.Zone
                  ? profiles?.find((p) => p.id === id)?.renderer
                  : undefined;
              return {
                id: g.key,
                name: label(g.key, g.label, g.profile),
                renderer,
                icon:
                  kind === Kind.Indicator
                    ? indicatorIcons[id] ?? category.icon
                    : category.icon,
              };
            })}
          />
        )}
      </div>
      {kind === Kind.Zone && topology && (
        <div className="lighting-actions">
          <button
            className="studio-button"
            disabled={offline || availableKey === undefined || creating}
            onClick={() =>
              availableKey !== undefined && choose(availableKey, true)
            }
          >
            New independent group
          </button>
          <small>
            {directory.groups.filter((g) => isCustom(g.key, directory)).length}{" "}
            / {topology.capacity} custom groups
          </small>
        </div>
      )}
      {!topology && (
        <small>
          Update this side’s firmware to edit LED positions and create groups.
        </small>
      )}
      {!directory.mainSlots && topology && (
        <small>
          Update this side’s firmware to edit main preset and layer LED
          positions.
        </small>
      )}
      {directory.mainSlots && (
        <div hidden={kind !== Kind.Main}>
          <MainManagement
            management={management}
            directory={directory}
            selected={selected}
            onComplete={async (key) => {
              const next = await refreshDirectory();
              const target =
                next.groups.find((g) => g.key === key) ??
                next.groups.find((g) => g.key >> 16 === Kind.Main);
              if (kind === Kind.Main) {
                setMissing(undefined);
                if (key !== selected || !target || key !== target.key)
                  setEditing(false);
                if (!target && activeTarget.current?.side === management.side)
                  activeTarget.current = undefined;
              }
              setNavigation((previous) => ({
                ...previous,
                keys: { ...previous.keys, [Kind.Main]: target?.key },
              }));
              bumpForm((n) => n + 1);
              onSaved?.();
            }}
          />
        </div>
      )}
      {selected !== undefined && kind !== undefined ? (
        <GroupForm
          key={kind === Kind.Main ? selected + "/" + formVersion : selected}
          api={api}
          groupKey={selected}
          editing={editing}
          setEditing={setEditing}
          side={management.side}
          activeTarget={activeTarget}
          storage={storage + ":" + selected}
          offline={offline}
          directory={directory}
          creating={creating}
          refreshDirectory={refreshDirectory}
          onCancelNew={() => {
            writeStorage(storage + ":" + selected, undefined);
            activeTarget.current = undefined;
            setEditing(false);
            setNavigation((previous) => ({
              ...previous,
              newZone: undefined,
              keys: { ...previous.keys, [Kind.Zone]: undefined },
            }));
          }}
          onSaved={async () => {
            const next = await refreshDirectory();
            setNavigation((previous) => {
              const remembered = previous.keys[kind];
              const removed = !next.groups.some((g) => g.key === selected);
              return {
                ...previous,
                newZone:
                  previous.newZone === selected ? undefined : previous.newZone,
                keys:
                  removed && remembered === selected
                    ? { ...previous.keys, [kind]: undefined }
                    : previous.keys,
              };
            });
            onSaved?.();
          }}
        />
      ) : (
        !category && <p>No editable lighting groups on this side.</p>
      )}
    </>
  );
}

const runningPresets = new WeakMap<RpcConnection, Promise<number>>();
function MainManagement({
  management,
  directory,
  selected,
  onComplete,
}: {
  management: Management;
  directory: Directory;
  selected?: number;
  onComplete: (key: number) => Promise<void>;
}) {
  const { storage, side, clients, conn } = management;
  const [op, setOp] = useState(() => readStorage<PresetOperation>(storage));
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const current = directory.groups.find(
    (g) => g.key === selected && g.key >> 16 === Kind.Main,
  );
  function remember(next?: PresetOperation) {
    writeStorage(storage, next);
    setOp(next);
  }
  function start(action: PresetRequest["action"]) {
    const name = current?.label || "Main preset";
    remember({
      request: {
        action,
        source: current?.key ?? Kind.Main << 16,
        side,
        name:
          action === "create"
            ? "New preset"
            : action === "copy"
              ? name + " copy"
              : name,
      },
    });
    setMessage("");
  }
  const submitRef = useRef<() => Promise<void>>();
  async function submit() {
    const draft = readStorage<PresetOperation>(storage);
    if (!draft || busy) return;
    setBusy(true);
    setMessage("");
    try {
      let work = runningPresets.get(conn);
      if (!work) {
        const submitted = { ...draft, submitted: true };
        remember(submitted);
        work = applyMainOperation(
          submitted,
          clients,
          remember,
          async (removed, fallback) => {
            const state = (
              await call_rpc(conn, { lighting: { getState: true } })
            ).lighting?.state;
            if (!state) throw Error("Could not read the active preset.");
            if (
              state.profile === removed &&
              (
                await call_rpc(conn, {
                  lighting: { set: { profile: fallback } },
                })
              ).lighting?.state?.profile !== fallback
            )
              throw Error("Could not switch away from the deleted preset.");
          },
        ).finally(() => runningPresets.delete(conn));
        runningPresets.set(conn, work);
      }
      const key = await work;
      remember();
      await onComplete(key);
      setMessage("Main preset confirmed on every side.");
    } catch (e) {
      setOp(readStorage(storage));
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  submitRef.current = submit;
  useEffect(() => {
    if (readStorage<PresetOperation>(storage)?.submitted)
      void submitRef.current?.();
  }, [storage, conn]);
  useEffect(() => {
    if (
      busy ||
      !op?.submitted ||
      !/offline|connect|did not reply/i.test(message)
    )
      return;
    const timer = setTimeout(() => void submitRef.current?.(), 5000);
    return () => clearTimeout(timer);
  }, [busy, op, message]);
  const names = {
    create: "New main preset",
    copy: "Duplicate main preset",
    rename: "Rename main preset",
    delete: "Delete main preset",
    restore: "Restore main preset",
  };
  return (
    <fieldset className="lighting-fields" disabled={busy}>
      <legend>Main preset management</legend>
      <small>
        {directory.groups.filter((g) => customMain(g.key, directory)).length} /{" "}
        {directory.mainSlots!.count} custom presets on this side
      </small>
      <div className="lighting-actions">
        {op ? (
          <>
            <strong>{names[op.request.action]}</strong>
            {!["delete", "restore"].includes(op.request.action) && (
              <label>
                Shared preset name{" "}
                <input
                  value={op.request.name}
                  disabled={!!op.targets}
                  onChange={(e) =>
                    remember({
                      ...op,
                      request: { ...op.request, name: e.target.value },
                    })
                  }
                />
              </label>
            )}
            {op.request.action === "restore" && (
              <small>
                Restore settings on the selected side and the shared name on all
                sides.
              </small>
            )}
            <button
              className="studio-button"
              type="button"
              onClick={() => void submit()}
            >
              {op.targets ? "Resume preset change" : "Apply preset change"}
            </button>
            {op.targets &&
              /changed on the keyboard|changed during/.test(message) && (
                <button
                  type="button"
                  onClick={() => {
                    remember();
                    setMessage(
                      "Draft cleared. Any sides that already confirmed the change retain their settings.",
                    );
                  }}
                >
                  Discard conflicting draft
                </button>
              )}
            {!op.targets && (
              <button
                type="button"
                onClick={() => {
                  remember();
                  setMessage("");
                }}
              >
                Cancel
              </button>
            )}
          </>
        ) : (
          (Object.keys(names) as PresetRequest["action"][])
            .filter(
              (action) =>
                action === "create" ||
                (current &&
                  (action === "delete"
                    ? customMain(current.key, directory)
                    : action === "restore"
                      ? !customMain(current.key, directory)
                      : true)),
            )
            .map((action) => (
              <button
                type="button"
                className="studio-button"
                key={action}
                onClick={() => start(action)}
              >
                {names[action]}
              </button>
            ))
        )}
      </div>
      <div role="status">{busy ? "Checking keyboard sides…" : message}</div>
    </fieldset>
  );
}

function LiveStatus({
  api,
  mask,
  layers,
  unavailable,
}: {
  api: Client;
  mask: number;
  layers: Layer[];
  unavailable: () => void;
}) {
  const [live, setLive] = useState<Live>(),
    [error, setError] = useState(""),
    [trigger, setTrigger] = useState(false);
  const [source, setSource] = useState(() => mask & -mask);
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (!document.hidden) {
          const value = await api.live();
          if (active) {
            setLive(value);
            setError("");
          }
        }
      } catch (e) {
        if (active) {
          setLive(undefined);
          setError(String(e));
          unavailable();
        }
        return;
      }
      if (active) timer = setTimeout(poll, 3000);
    }
    if (!trigger) void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, trigger, unavailable]);
  async function show() {
    setTrigger(true);
    try {
      await api.show(source);
    } catch (e) {
      setError(String(e));
      unavailable();
    } finally {
      setTrigger(false);
    }
  }
  return (
    <div className="lighting-live">
      <h4>Live status</h4>
      {error && <p role="alert">{error}</p>}
      {live && (
        <>
          <p>
            {sourceNames[live.source]}
            {live.layer !== 255 && " · " + layerName(layers, live.layer)}
            {live.layerEffect !== 255 &&
              ` · Layer color: ${layerName(layers, live.layerEffect)}`}
            {live.mask !== 0 &&
              " · " + sources.filter((_, i) => live.mask & (1 << i)).join(", ")}
          </p>
          <small>
            {[
              mask & live.reported & 1 ? `Battery ${live.battery}%` : "",
              mask & live.reported & 2
                ? `USB ${["disconnected", "powered", "HID"][live.usb]}`
                : "",
              mask & live.reported & 4
                ? `Bluetooth ${live.bleProfile + 1} ${["disconnected", "connected", "pairing"][live.ble]}`
                : "",
              mask & live.reported & 8
                ? locks.filter((_, i) => live.locks & (1 << i)).join(", ") ||
                  "Lock keys off"
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </small>
        </>
      )}
      {!!mask && (
        <div className="lighting-actions">
          <label>
            Status source{" "}
            <select value={source} onChange={(e) => setSource(+e.target.value)}>
              {sources.map((name, i) =>
                mask & (1 << i) ? (
                  <option key={name} value={1 << i}>
                    {name}
                  </option>
                ) : null,
              )}
            </select>
          </label>
          <button
            className="studio-button"
            disabled={trigger || !!error}
            onClick={() => void show()}
          >
            Show on keyboard
          </button>
        </div>
      )}
    </div>
  );
}

const titles: Record<number, string> = {
  [Field.Name]: "Preset name",
  [Field.GroupName]: "Group name",
  [Field.Renderer]: "Animation",
  [Field.Brightness]: "Preset brightness (%)",
  [Field.Period]: "Animation period (ms)",
  [Field.Afterglow]: "Afterglow (ms)",
  [Field.Fade]: "Fade time (ms)",
  [Field.Range]: "Spread (grid cells)",
  [Field.DisplayTime]: "Display duration (ms)",
  [Field.Timeout]: "Default status duration (ms)",
  [Field.BatteryTime]: "Battery duration (ms)",
  [Field.UsbTime]: "USB duration (ms)",
  [Field.BleTime]: "Bluetooth duration (ms)",
  [Field.HidTime]: "Lock key duration (ms)",
  [Field.PairHold]: "Hold while pairing",
};
const colorTitles = [
  ["On color", "Off color", "Battery level colors"],
  ["HID connected", "USB powered", "USB disconnected"],
  ["Pairing", "Connected", "Disconnected"],
];

function GroupForm({
  editing,
  setEditing,
  side,
  activeTarget,
  api,
  groupKey,
  directory,
  creating,
  refreshDirectory,
  onCancelNew,
  storage,
  offline,
  onSaved,
}: {
  editing: boolean;
  setEditing: (value: boolean) => void;
  side: number;
  activeTarget: ActiveTarget;
  api: Client;
  groupKey: number;
  directory: Directory;
  creating: boolean;
  refreshDirectory: () => Promise<Directory>;
  onCancelNew: () => void;
  storage: string;
  offline: boolean;
  onSaved: () => Promise<void>;
}) {
  const [openedUnlisted] = useState(creating);
  useLayoutEffect(() => {
    const entry = directory.groups.find((g) => g.key === groupKey);
    activeTarget.current = {
      key: groupKey,
      label: entry?.label ?? "",
      profile: entry?.profile ?? "",
      side,
      creating,
      editing,
    };
  }, [activeTarget, directory, groupKey, side, creating, editing]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [group, setGroup] = useState<Group>(),
    [draft, setDraft] = useState<Draft | undefined>(() =>
      readStorage<Draft>(storage),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [notice, setNotice] = useState(""),
    [attempt, retry] = useState(0);
  const update = (next?: Draft) => {
    writeStorage(storage, next);
    setDraft(next);
  };
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    api
      .group(groupKey, controller.signal)
      .then(async (g) => {
        if (controller.signal.aborted) return;
        if (attempt > 0 || (openedUnlisted && g.leds.length))
          await refreshDirectory();
        if (controller.signal.aborted) return;
        setGroup(g);
        const d = readStorage<Draft>(storage);
        if (
          d &&
          (d.pending === "restore"
            ? g.revision === g.factoryRevision
            : same(g.values, d.values))
        ) {
          writeStorage(storage, undefined);
          setDraft(undefined);
          setNotice(d.pending ? "Confirmed by keyboard readback." : "");
        } else if (d?.pending) {
          const kept = { ...d, pending: undefined };
          writeStorage(storage, kept);
          setDraft(kept);
          setNotice(
            "Readback complete. Review the retained draft before retrying.",
          );
        } else if (d) {
          setNotice(
            "Draft restored for this board and side. Review before applying.",
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, groupKey, storage, attempt, refreshDirectory, openedUnlisted]);
  const values = draft?.values ?? group?.values,
    kind = groupKey >> 16,
    id = groupKey & 255;
  const conflict = !!group && !!draft && draft.base !== group.revision;
  function change(field: number, value: Values[number]) {
    if (!group || !values) return;
    const next = { ...values, [field]: value };
    if (field === Field.Renderer) {
      if (Field.Style in next) next[Field.Style] = 0;
      if (Field.Direction in next) next[Field.Direction] = 0;
    }
    changeValues(next);
  }
  function changeValues(next: Values) {
    if (!group) return;
    setNotice("");
    update(
      same(next, group.values)
        ? undefined
        : { values: next, base: group.revision },
    );
  }
  async function save(restore: boolean) {
    if (!group || !values || offline || conflict || busy) return;
    const pending: Draft = {
      values,
      base: group.revision,
      pending: restore ? "restore" : "apply",
    };
    update(pending);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const g = await api.save(
        groupKey,
        group.revision,
        restore ? undefined : values,
      );
      if (restore ? g.revision !== g.factoryRevision : !same(values, g.values))
        throw Error("Readback differs from the requested configuration.");
      // A different editor may already have opened this draft during the transfer.
      if (JSON.stringify(readStorage(storage)) === JSON.stringify(pending))
        update();
      setGroup(g);
      setNotice(
        restore
          ? "Firmware defaults confirmed."
          : "Changes confirmed by keyboard readback.",
      );
      await onSaved();
      setConfirmDelete(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const members = values?.[Field.Members];
  const editable = Array.isArray(members) && !!directory.topology;
  const custom = isCustom(groupKey, directory);
  const changeMembers = (next: number[]) =>
    values && changeValues(withMembers(groupKey, values, next));
  const disabled = busy || offline || conflict || !!error;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            className="studio-button"
            disabled={busy || offline}
            onClick={() => retry((n) => n + 1)}
          >
            Read group again
          </button>
        </p>
      )}
      {editing && (!group || error || !editable || values?.[Field.Disabled]) ? (
        <LedCanvasNotice>
          {error ||
            (!group
              ? "Reading LED positions…"
              : values?.[Field.Disabled]
                ? "Add the layer effect on this side to select LEDs."
                : "This side’s firmware does not support editing these LED positions.")}
        </LedCanvasNotice>
      ) : null}
      {group && values ? (
        <>
          {!editable && !!group.leds.length && (
            <p className="lighting-members">
              Logical LEDs · {group.leds.join(", ")}
            </p>
          )}
          {conflict && (
            <p role="alert">
              This group changed on the keyboard.{" "}
              <button
                type="button"
                className="studio-button"
                onClick={() => update()}
              >
                Use keyboard values
              </button>{" "}
              <button
                type="button"
                className="studio-button"
                onClick={() => {
                  const kept = { ...group.values, ...draft!.values };
                  if (groupKey >> 16 === Kind.Main && directory.mainSlots) {
                    kept[Field.Name] = group.values[Field.Name];
                    if (Field.Disabled in group.values)
                      kept[Field.Disabled] = group.values[Field.Disabled];
                  }
                  update({ values: kept, base: group.revision });
                }}
              >
                Keep my group values
              </button>
            </p>
          )}
          <fieldset
            className="lighting-fields"
            disabled={busy || offline || conflict || !!error}
          >
            {kind === Kind.Layer && values[Field.Disabled] !== undefined && (
              <button
                type="button"
                className="studio-button"
                onClick={() => {
                  change(Field.Disabled, values[Field.Disabled] ? 0 : 1);
                  setEditing(!!values[Field.Disabled]);
                }}
              >
                {values[Field.Disabled]
                  ? "Add layer effect"
                  : "Remove layer effect"}
              </button>
            )}
            {editable && !values[Field.Disabled] && (
              <>
                <button
                  type="button"
                  className="studio-button"
                  aria-pressed={editing}
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? "Finish selecting LEDs" : "Edit LED positions"}
                </button>
                {editing && !error && (
                  <LedPositionPicker
                    side={side}
                    directory={directory}
                    groupKey={groupKey}
                    members={members}
                    colors={
                      Array.isArray(values[Field.Primary])
                        ? (values[Field.Primary] as number[])
                        : undefined
                    }
                    disabled={disabled}
                    change={changeMembers}
                  />
                )}
                <fieldset className="lighting-members">
                  <legend>Logical LEDs</legend>
                  {members.length === 0 && <small>No LEDs selected</small>}
                  <ol className="led-member-order">
                    {members.map((led, i) => (
                      <li key={led}>
                        <span>
                          {kind === Kind.Indicator && id === 2
                            ? `Profile ${i + 1} → `
                            : kind === Kind.Indicator && id === 0
                              ? `Step ${i + 1} → `
                              : ""}
                          LED {led}
                        </span>
                        {editing &&
                          [-1, 1].map((direction) => {
                            const dest = i + direction;
                            return (
                              <button
                                type="button"
                                key={direction}
                                disabled={dest < 0 || dest >= members.length}
                                aria-label={`Move LED ${led} ${direction < 0 ? "earlier" : "later"}`}
                                onClick={() => {
                                  const next = [...members];
                                  [next[i], next[dest]] = [next[dest], next[i]];
                                  changeMembers(next);
                                }}
                              >
                                {direction < 0 ? "←" : "→"}
                              </button>
                            );
                          })}
                      </li>
                    ))}
                  </ol>
                </fieldset>
              </>
            )}
            <div className="lighting-grid">
              {Object.entries(values).map(([key, v]) => {
                const f = +key,
                  title =
                    kind === Kind.Layer && f === Field.Brightness
                      ? "Layer brightness (%)"
                      : titles[f];
                if (
                  f === Field.Disabled ||
                  (kind === Kind.Main &&
                    !!directory.mainSlots &&
                    f === Field.Name) ||
                  Array.isArray(v) ||
                  ([Field.Afterglow, Field.Fade, Field.Range].includes(f) &&
                    values[Field.Renderer] !== 4)
                )
                  return null;
                if (f === Field.Renderer)
                  return (
                    <label className="lighting-control" key={key}>
                      {title}
                      <select
                        aria-label={title}
                        value={v}
                        onChange={(e) => change(f, +e.target.value)}
                      >
                        {rendererNames.map((n, i) =>
                          group.renderers & (1 << i) ? (
                            <option key={n} value={i}>
                              {n}
                            </option>
                          ) : null,
                        )}
                      </select>
                    </label>
                  );
                if (f === Field.Style || f === Field.Direction) {
                  const renderer = Number(values[Field.Renderer]);
                  const options =
                    f === Field.Style
                      ? effectStyles[renderer]
                      : reversibleEffects.includes(renderer)
                        ? ["Forward", "Reverse"]
                        : undefined;
                  if (!options) return null;
                  return (
                    <label className="lighting-control" key={key}>
                      {f === Field.Style ? "Style" : "Direction"}
                      <select
                        aria-label={f === Field.Style ? "Style" : "Direction"}
                        value={v}
                        onChange={(e) => change(f, Number(e.target.value))}
                      >
                        {options.map((label, i) => (
                          <option key={label} value={i}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                if (f === Field.PairHold)
                  return (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={!!v}
                        onChange={(e) => change(f, Number(e.target.checked))}
                      />{" "}
                      {title}
                    </label>
                  );
                if (f === Field.Name || f === Field.GroupName)
                  return (
                    <label className="lighting-control" key={key}>
                      {title}
                      <input
                        value={v}
                        required={f === Field.GroupName && custom}
                        ref={(input) =>
                          input?.setCustomValidity(
                            new TextEncoder().encode(String(v)).length > 63 &&
                              group.values[f] !== v
                              ? "Use up to 63 UTF-8 bytes."
                              : "",
                          )
                        }
                        onChange={(e) => change(f, e.target.value)}
                      />
                    </label>
                  );
                const optional = f >= Field.BatteryTime && f <= Field.HidTime;
                const max =
                  f === Field.Brightness
                    ? 100
                    : optional || f === Field.Period || f === Field.Timeout
                      ? 65535
                      : 2147483647;
                return (
                  <div key={key}>
                    <label className="lighting-control">
                      {title}
                      <input
                        type="number"
                        disabled={optional && v === inherit}
                        value={v === inherit ? "" : v}
                        min={0}
                        max={max}
                        required
                        onChange={(e) =>
                          change(
                            f,
                            e.target.value === "" ? "" : +e.target.value,
                          )
                        }
                      />
                    </label>
                    {optional && (
                      <label>
                        <input
                          type="checkbox"
                          checked={v === inherit}
                          onChange={(e) =>
                            change(
                              f,
                              e.target.checked
                                ? inherit
                                : Number(values[Field.Timeout]),
                            )
                          }
                        />{" "}
                        Use default duration
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            {kind === Kind.Timing && (
              <small>
                A duration of 0 uses the firmware’s persistent display rules for
                that source.
              </small>
            )}
            {Object.entries(values).map(([key, v]) =>
              Array.isArray(v) && +key !== Field.Members ? (
                <ColorList
                  key={key}
                  colors={v}
                  leds={editable ? members : group.leds}
                  buckets={
                    kind === Kind.Indicator &&
                    id === 0 &&
                    +key === Field.Tertiary
                  }
                  title={
                    kind === Kind.Indicator
                      ? (colorTitles[id] ?? ["On color", "Off color"])[
                          +key - Field.Primary
                        ]
                      : "Effect colors"
                  }
                  change={(next) => change(+key, next)}
                />
              ) : null,
            )}
            <div className="lighting-actions">
              <button
                className="studio-button"
                type="submit"
                disabled={!draft || (custom && editable && !members.length)}
              >
                Apply
              </button>
              {creating && (
                <button
                  type="button"
                  className="studio-button"
                  onClick={onCancelNew}
                >
                  Cancel new group
                </button>
              )}
              {kind === Kind.Main && directory.mainSlots ? null : custom ? (
                !creating && (
                  <button
                    type="button"
                    className="studio-button"
                    onClick={() =>
                      confirmDelete ? void save(true) : setConfirmDelete(true)
                    }
                  >
                    {confirmDelete ? "Confirm delete group" : "Delete group"}
                  </button>
                )
              ) : (
                <button
                  className="studio-button"
                  type="button"
                  onClick={() => void save(true)}
                >
                  Restore firmware defaults
                </button>
              )}
              {confirmDelete && (
                <button type="button" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              )}
            </div>
          </fieldset>
        </>
      ) : (
        busy && <p>Reading group…</p>
      )}
      <div role="status">
        {busy && group ? "Waiting for keyboard…" : notice}
      </div>
    </form>
  );
}

function ColorList({
  colors,
  leds,
  buckets,
  title,
  change,
}: {
  colors: number[];
  leds: number[];
  buckets: boolean;
  title: string;
  change: (v: number[]) => void;
}) {
  return (
    <fieldset className="lighting-colors">
      <legend>{title}</legend>
      {leds.length > 1 && !buckets && (
        <label>
          Color assignment{" "}
          <select
            aria-label={title + " assignment"}
            value={colors.length === 1 ? "all" : "per"}
            onChange={(e) =>
              change(
                e.target.value === "all"
                  ? [colors[0]]
                  : leds.map(() => colors[0]),
              )
            }
          >
            <option value="all">All LEDs</option>
            <option value="per">Per LED</option>
          </select>
        </label>
      )}
      {buckets && (
        <small>
          Equal charge ranges, from empty to full. An empty list uses the on
          color.
        </small>
      )}
      <div className="lighting-swatches">
        {colors.map((c, i) => {
          const label = buckets
            ? `${Math.ceil((i * 101) / colors.length)}–${Math.ceil(((i + 1) * 101) / colors.length) - 1}%`
            : colors.length > 1
              ? `LED ${leds[i]}`
              : "All LEDs";
          const set = (next: number) =>
            change(colors.map((v, j) => (i === j ? next : v)));
          return (
            <div key={buckets ? i : label} className="lighting-swatch">
              <span>{label}</span>
              <FirmwareColorPicker
                value={c}
                label={title + " " + label}
                onChange={set}
                custom
              />
              {buckets && (
                <button
                  type="button"
                  className="studio-button"
                  aria-label={"Remove " + label}
                  onClick={() => change(colors.filter((_, j) => i !== j))}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
      {buckets && (
        <button
          type="button"
          className="studio-button"
          disabled={colors.length >= 101}
          onClick={() => change([...colors, colors.at(-1) ?? 0xffffff])}
        >
          Add charge range
        </button>
      )}
    </fieldset>
  );
}
