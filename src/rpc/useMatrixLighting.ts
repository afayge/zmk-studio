import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ConnectionContext } from "./ConnectionContext";
import { LockStateContext } from "./LockStateContext";
import { LightingSupport } from "./generated/core";
import type { Catalog, Setting, State } from "./generated/lighting";
import {
  Field,
  Kind,
  lightingEditor,
  type Directory,
  type Group,
  unassigned,
  palette,
  rainbow,
} from "./lightingEditor";
import { call_rpc } from "./logging";
import { useSub } from "../usePubSub";
import {
  indicatorMask,
  statusColors,
  type StatusColor,
} from "../keyboard/statusPreview";
import { makePreview } from "../keyboard/matrixPreview";

export type MatrixLighting = ReturnType<typeof useMatrixLighting>;

export interface SideLighting {
  side: number;
  directory?: Directory;
  topology?: Directory["topology"];
  loaded?: boolean;
  group?: Group;
  layer?: Group;
  zones: Map<number, Group>;
  source?: number;
  status?: Map<number, StatusColor>;
  activeLayer?: Group;
}

export function useMatrixLighting(
  support: LightingSupport,
  layoutIndex: number,
  layerId?: number,
  keyCount = Infinity,
) {
  const connection = useContext(ConnectionContext).conn;
  const unlocked =
    useContext(LockStateContext) ===
    LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;
  const conn =
    unlocked && support === LightingSupport.LED_MATRIX ? connection : null;
  const [catalog, setCatalog] = useState<Catalog>();
  const [state, setState] = useState<State>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const session = useRef<{
    refresh: () => void;
    apply: (setting: Setting) => Promise<State | undefined>;
  }>();
  useSub("rpc_notification.lighting.stateChanged", () =>
    session.current?.refresh(),
  );

  useEffect(() => {
    if (!conn) return;
    let active = true,
      reading = false,
      dirty = false;
    async function refresh() {
      dirty = true;
      if (reading) return;
      reading = true;
      try {
        while (active && dirty) {
          dirty = false;
          const next = (await call_rpc(conn!, { lighting: { getState: true } }))
            .lighting?.state;
          if (!next)
            throw Error("Could not read the current lighting settings.");
          if (active) setState(next);
        }
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        reading = false;
      }
    }
    async function apply(setting: Setting) {
      try {
        const next = (await call_rpc(conn!, { lighting: { set: setting } }))
          .lighting?.state;
        if (!next)
          throw Error("The keyboard could not apply that lighting setting.");
        if (active) {
          setState(next);
          setError("");
          return next;
        }
      } catch (e) {
        if (active) {
          setError(String(e));
          void refresh();
        }
      }
    }
    session.current = { refresh, apply };
    setError("");
    void call_rpc(conn, { lighting: { getCatalog: true } })
      .then((response) => {
        if (!active) return;
        if (!response.lighting?.catalog)
          throw Error("Could not load the lighting presets.");
        setCatalog(response.lighting.catalog);
        void refresh();
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      session.current = undefined;
    };
  }, [conn, attempt]);

  const directoryCache = useRef(new Map<number, Directory>());
  useEffect(() => {
    directoryCache.current = new Map();
  }, [conn, layoutIndex, catalog]);
  const profile = state?.profile;
  const zoneSelection = state?.zoneProfiles.join(",");
  const [detail, setDetail] = useState<{
    catalog: Catalog;
    profile: number;
    zoneSelection?: string;
    layerId?: number;
    started: number;
    layoutIndex: number;
    sides: SideLighting[];
  }>();
  useEffect(() => {
    if (
      !conn ||
      !catalog ||
      ![1, 2, 3].includes(catalog.editorVersion) ||
      profile === undefined
    )
      return;
    const controller = new AbortController();
    const { signal } = controller;
    const started = performance.now();
    const directories = directoryCache.current;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const snapshot = {
      catalog,
      profile,
      zoneSelection,
      layoutIndex,
      started,
      layerId,
    };
    setDetail((previous) => ({
      ...snapshot,
      sides:
        previous?.catalog === catalog && previous.layoutIndex === layoutIndex
          ? previous.sides.map(({ side, directory, topology }) => ({
              side,
              directory,
              topology,
              zones: new Map(),
            }))
          : [],
    }));
    const selected = zoneSelection?.split(",").map(Number) ?? [];

    function publish(side: number, patch?: Partial<SideLighting>) {
      if (signal.aborted) return;
      setDetail((current) => {
        if (!current || current.started !== started || signal.aborted)
          return current;
        const old = current.sides.find((s) => s.side === side);
        if (!old && !patch) return current;
        const sides = current.sides.filter((s) => s.side !== side);
        if (patch) sides.push({ side, zones: new Map(), ...old, ...patch });
        return { ...current, sides: sides.sort((a, b) => a.side - b.side) };
      });
    }

    function observeSide(side: number) {
      const client = lightingEditor(conn!, side);
      let loaded: SideLighting | undefined;
      let lastLive = "";
      let lastLayer: number | undefined;
      let activeLayer: Group | undefined;
      const indicators = new Map<number, Group>();
      async function readSide() {
        let directory = directories.get(side);
        if (!directory && catalog!.editorVersion >= 2) {
          directory = await client.directory(signal, layoutIndex);
          if (!signal.aborted) directories.set(side, directory);
        }
        const readGroup = async (key: number) =>
          directory?.groups.some((g) => g.key === key)
            ? client.group(key, signal)
            : undefined;
        const mainKey = (Kind.Main << 16) | profile!;
        const group =
          !directory && catalog!.profiles.some((p) => p.id === profile)
            ? await client.group(mainKey, signal)
            : await readGroup(mainKey);
        const layer =
          layerId === undefined
            ? undefined
            : await readGroup((Kind.Layer << 16) | layerId);
        const zones = new Map<number, Group>();
        const owners = new Set(
          directory?.topology?.leds
            .filter(
              (l) =>
                l.owner !== unassigned &&
                (l.position === unassigned || l.position >= keyCount),
            )
            .map((l) => l.owner),
        );
        for (const owner of owners) {
          const profiles = directory!.groups.filter(
            (g) => g.key >> 8 === ((Kind.Zone << 8) | owner),
          );
          // The global state reports the connected controller's local zone selections.
          const entry =
            profiles.length === 1
              ? profiles[0]
              : side === 0
                ? profiles.find((g) => (g.key & 255) === selected[owner])
                : undefined;
          if (entry) zones.set(owner, await client.group(entry.key, signal));
        }
        return {
          side,
          directory,
          topology: directory?.topology,
          loaded: true,
          group,
          layer,
          zones,
        };
      }
      async function poll() {
        try {
          if (!document.hidden) {
            if (!loaded) {
              loaded = await readSide();
              if (signal.aborted) return;
              publish(side, loaded);
              if (catalog!.editorVersion < 2) return;
            }
            if (
              loaded.topology?.leds.some(
                (l) => l.position === unassigned || l.position >= keyCount,
              )
            ) {
              const live = await client.live();
              const signature = live.mask
                ? JSON.stringify(live)
                : [live.source, live.layerEffect].join("/");
              if (signature !== lastLive) {
                if (live.layerEffect !== lastLayer) {
                  const key = (Kind.Layer << 16) | live.layerEffect;
                  activeLayer =
                    live.layerEffect === 255
                      ? undefined
                      : live.layerEffect === layerId
                        ? loaded.layer
                        : loaded.directory?.groups.some((g) => g.key === key)
                          ? await client.group(key, signal)
                          : undefined;
                  lastLayer = live.layerEffect;
                }
                for (const entry of loaded.directory?.groups ?? []) {
                  const id = entry.key & 255;
                  if (
                    entry.key >> 16 === Kind.Indicator &&
                    live.mask & indicatorMask(id) &&
                    !indicators.has(id)
                  )
                    indicators.set(id, await client.group(entry.key, signal));
                }
                publish(side, {
                  activeLayer,
                  source: live.source,
                  status: statusColors(live, indicators),
                });
                lastLive = signature;
              }
            } else if (side === 0 || !loaded.topology) return;
            else await client.live();
          }
        } catch {
          if (signal.aborted) return;
          directories.delete(side);
          loaded = undefined;
          lastLayer = undefined;
          activeLayer = undefined;
          lastLive = "";
          indicators.clear();
          publish(side);
        }
        if (!signal.aborted) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            void poll();
          }, 3000);
          timers.add(timer);
        }
      }
      void poll();
    }
    for (let side = 0; side <= catalog.peripheralSlots; side++)
      observeSide(side);
    return () => {
      controller.abort();
      timers.forEach(clearTimeout);
    };
  }, [conn, catalog, profile, layoutIndex, layerId, zoneSelection, keyCount]);

  const sideGroups =
    conn &&
    catalog &&
    detail?.catalog === catalog &&
    detail.profile === profile &&
    detail.zoneSelection === zoneSelection &&
    detail.layoutIndex === layoutIndex &&
    detail.layerId === layerId
      ? detail.sides
      : [];
  const preview = useMemo(() => {
    if (!conn || !catalog || !state) return;
    if (
      !detail ||
      detail.catalog !== catalog ||
      detail.profile !== profile ||
      detail.layerId !== layerId ||
      detail.layoutIndex !== layoutIndex
    )
      return catalog.editorVersion < 2
        ? makePreview(catalog, state)
        : undefined;
    const sides = detail.sides
      .filter((s) => s.side === 0 || s.topology)
      .flatMap(
        ({ group, topology, layer }) =>
          makePreview(catalog, state, group, topology, layer, detail.started) ??
          [],
      );
    return sides.length ? { ...sides[0], sides } : undefined;
  }, [conn, catalog, state, detail, profile, layerId, layoutIndex]);
  const [colorRevision, setColorRevision] = useState(0);
  async function saveColor(side: number, led: number, color: number) {
    const group = sideGroups.find((s) => s.side === side)?.group;
    const colors = group?.values[Field.Primary];
    if (
      !conn ||
      !group ||
      profile === undefined ||
      !Array.isArray(colors) ||
      (led !== -1 && !group.leds.includes(led))
    )
      throw Error("Read the current preset before applying a color.");
    const next =
      led === -1
        ? [color]
        : group.leds.map((id, i) =>
            id === led ? color : colors[i] ?? colors[0] ?? 0,
          );
    const client = lightingEditor(conn, side);
    const key = (Kind.Main << 16) | profile;
    let saved: Group;
    let writeError: unknown;
    try {
      saved = await client.save(key, group.revision, {
        ...group.values,
        [Field.Primary]: next,
      });
    } catch (error) {
      writeError = error;
      // A lost acknowledgement can follow a successful commit. Reconcile the target before retrying.
      try {
        saved = await client.group(key);
      } catch {
        setDetail(
          (current) =>
            current && {
              ...current,
              sides: current.sides.filter(
                (s) => s.side !== side || s.group !== group,
              ),
            },
        );
        setAttempt((n) => n + 1);
        throw error;
      }
    }
    setDetail((current) =>
      current?.sides.find((s) => s.side === side)?.group === group && current
        ? {
            ...current,
            sides: current.sides.map((s) =>
              s.side === side ? { ...s, group: saved } : s,
            ),
          }
        : current,
    );
    setColorRevision((n) => n + 1);
    if (JSON.stringify(saved.values[Field.Primary]) !== JSON.stringify(next))
      throw (
        writeError ?? Error("Color readback differs from the requested color.")
      );
  }
  const paletteLock = useRef(false);
  const [paletteBusy, setPaletteBusy] = useState(false);
  const [paletteIssue, setPaletteIssue] = useState<{
    side: number;
    profile: number;
    message: string;
    hue?: number;
  }>();
  async function choosePaletteColor(
    side: number,
    choice: number,
    retryPreset = false,
  ) {
    if (paletteLock.current || !catalog || profile === undefined) return;
    const current = sideGroups.find((s) => s.side === side);
    if ([1, 2, 3].includes(catalog.editorVersion) && !current?.loaded) return;
    const colors = current?.group?.values[Field.Primary];
    const wholeRainbow =
      Array.isArray(colors) && colors.length === 1 && colors[0] === rainbow;
    if (
      retryPreset &&
      (!wholeRainbow ||
        choice !== state?.hue ||
        paletteIssue?.hue !== choice ||
        paletteIssue.side !== side ||
        paletteIssue.profile !== profile)
    )
      return;
    paletteLock.current = true;
    setPaletteBusy(true);
    setPaletteIssue(undefined);
    let confirmedHue: number | undefined;
    try {
      if (choice === rainbow) {
        if (!wholeRainbow) await saveColor(side, -1, rainbow);
      } else {
        if (!retryPreset) {
          const result = await session.current?.apply({ hue: choice });
          if (result?.hue !== choice)
            throw Error("The keyboard did not confirm the selected hue.");
          if (result.profile !== profile || !wholeRainbow) return;
        }
        confirmedHue = choice;
        await saveColor(side, -1, palette);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPaletteIssue({
        side,
        profile,
        hue: confirmedHue,
        message:
          confirmedHue === undefined
            ? message
            : `Hue ${Math.round((choice * 360) / catalog.hueCount)}° confirmed. Could not confirm the preset color. ${message}`,
      });
    } finally {
      paletteLock.current = false;
      setPaletteBusy(false);
    }
  }
  return {
    catalog: conn ? catalog : undefined,
    state: conn ? state : undefined,
    preview,
    sideGroups,
    saveColor,
    colorRevision,
    choosePaletteColor,
    paletteBusy,
    paletteIssue,
    error,
    retry: () => setAttempt((a) => a + 1),
    apply: async (setting: Setting) => {
      await session.current?.apply(setting);
    },
  };
}
