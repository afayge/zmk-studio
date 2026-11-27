import { Lightbulb } from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LightingSupport } from "../rpc/generated/core";
import type { Profile } from "../rpc/generated/lighting";
import type { MatrixLighting } from "../rpc/useMatrixLighting";

import { CustomPresetColor, type QuickColorDraft } from "./CustomPresetColor";
import { LightingChoiceGrid } from "./LightingChoiceGrid";
import { readStorage, writeStorage } from "./lightingStorage";
import { Field, rainbow } from "../rpc/lightingEditor";
import { colorBackground, ManualPaletteHue } from "./firmwareColors";
import { LightingEditor } from "./LightingEditor";
type EditorContext = {
  device?: string;
  layers: { id: number; name: string }[];
};
export function LightingPanel({
  support,
  lighting,
  ...editorContext
}: { support: LightingSupport; lighting: MatrixLighting } & EditorContext) {
  const { conn } = useContext(ConnectionContext);
  if (support !== LightingSupport.LED_MATRIX || !conn) {
    return (
      <p className="tool-panel">
        {support === LightingSupport.UNAVAILABLE
          ? "LED Matrix control is unavailable on this keyboard."
          : "Update the keyboard firmware to use Studio lighting controls."}
      </p>
    );
  }
  return (
    <LightingControls lighting={lighting} conn={conn} {...editorContext} />
  );
}

function LightingControls({
  conn,
  lighting: {
    catalog,
    state,
    error,
    retry,
    apply,
    sideGroups,
    saveColor,
    colorRevision,
    choosePaletteColor,
    paletteBusy,
    paletteIssue,
  },
  device,
  layers,
}: { conn: RpcConnection; lighting: MatrixLighting } & EditorContext) {
  const [quickDrafts, setQuickDrafts] = useState<
    Record<string, QuickColorDraft | undefined>
  >({});
  const prefix = JSON.stringify(["lighting-v1", device || conn.label]);
  const [preferredSide, setSide] = useState(
    () => readStorage<number>(prefix + ":side") ?? 0,
  );
  const side = Math.min(catalog?.peripheralSlots ?? 0, preferredSide);
  const editable = !!catalog && [1, 2, 3].includes(catalog.editorVersion);
  const current = sideGroups.find((s) => s.side === side);
  const group = current?.group;
  const groupName = group?.values[Field.Name];
  const draftKey = side + "/" + state?.profile;
  const primary = group?.values[Field.Primary];
  const supportsColor = editable && Array.isArray(primary);
  const wholeRainbow =
    supportsColor && primary.length === 1 && primary[0] === rainbow;
  const issue =
    paletteIssue?.side === side && paletteIssue?.profile === state?.profile
      ? paletteIssue
      : undefined;
  return (
    <section
      className="tool-panel lighting-panel"
      aria-label="Lighting settings"
    >
      {error && (
        <div className="studio-error" role="alert">
          {error}{" "}
          <button className="studio-button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {catalog && state ? (
        <>
          <div className="lighting-heading">
            <label>
              <input
                type="checkbox"
                role="switch"
                checked={state.enabled}
                onChange={(e) => void apply({ enabled: e.target.checked })}
              />
              LED Matrix
            </label>
            <small>
              {catalog.persistent
                ? "Saved automatically on the keyboard"
                : "Changes last for this session"}
            </small>
          </div>
          <ProfileGrid
            label="Main preset"
            profiles={catalog.profiles}
            value={state.profile}
            apply={(profile) => void apply({ profile })}
          />
          <div className="lighting-grid">
            <LightingRange
              label="Brightness"
              value={state.brightness}
              min={0}
              max={100}
              suffix="%"
              apply={(v) => apply({ brightness: v })}
            />
            <LightingRange
              label="Animation speed"
              value={state.speed}
              min={1}
              max={catalog.maxSpeed}
              apply={(speed) => apply({ speed })}
            />
          </div>
          {catalog.zones.map((z) => (
            <ProfileGrid
              key={z.id}
              label={z.name || `Zone ${z.id + 1}`}
              profiles={z.profiles}
              value={state.zoneProfiles[z.id]}
              apply={(profile) =>
                void apply({ zoneProfile: { zone: z.id, profile } })
              }
            />
          ))}
          {(catalog.hueCount > 0 || supportsColor) && (
            <fieldset
              className="lighting-palette"
              disabled={paletteBusy || (editable && !current?.loaded)}
            >
              <legend>Manual palette</legend>
              {Array.from({ length: catalog.hueCount }, (_, hue) => {
                const degrees = Math.round((hue * 360) / catalog.hueCount);
                return (
                  <button
                    type="button"
                    key={hue}
                    aria-label={`Hue ${degrees}°`}
                    title={`Hue ${degrees}°`}
                    aria-pressed={!wholeRainbow && state.hue === hue}
                    style={{ backgroundColor: `hsl(${degrees} 92% 48%)` }}
                    onClick={() => void choosePaletteColor(side, hue)}
                  />
                );
              })}
              {supportsColor && (
                <button
                  type="button"
                  aria-label="Dynamic rainbow"
                  title="Dynamic rainbow for all LEDs in this side’s active main preset"
                  aria-pressed={wholeRainbow}
                  style={{ background: colorBackground(rainbow, 0) }}
                  onClick={() => void choosePaletteColor(side, rainbow)}
                />
              )}
              <small>
                {supportsColor
                  ? "Rainbow colors the active main preset on this side. Choose a hue to return it to the manual palette."
                  : "Used by effects configured with a palette color."}
              </small>
              {issue && (
                <div role="alert">
                  {issue.message}{" "}
                  {issue.hue !== undefined &&
                    state.hue === issue.hue &&
                    wholeRainbow && (
                      <button
                        type="button"
                        className="studio-button"
                        onClick={() =>
                          void choosePaletteColor(side, issue.hue!, true)
                        }
                      >
                        Retry preset color
                      </button>
                    )}
                </div>
              )}
            </fieldset>
          )}
          {editable && (
            <ManualPaletteHue.Provider
              value={(state.hue * 360) / Math.max(1, catalog.hueCount)}
            >
              {group && (
                <CustomPresetColor
                  key={draftKey}
                  presetName={
                    typeof groupName === "string" && groupName
                      ? groupName
                      : catalog.profiles.find((p) => p.id === state.profile)
                          ?.name || `Preset ${state.profile + 1}`
                  }
                  group={group}
                  draft={quickDrafts[draftKey]}
                  remember={(draft) =>
                    setQuickDrafts((previous) =>
                      !draft && previous[draftKey] !== quickDrafts[draftKey]
                        ? previous
                        : { ...previous, [draftKey]: draft },
                    )
                  }
                  save={(led, color) => saveColor(side, led, color)}
                  reload={retry}
                />
              )}
              <LightingEditor
                colorRevision={colorRevision}
                conn={conn}
                prefix={prefix}
                side={side}
                selectSide={(next) => {
                  writeStorage(prefix + ":side", next);
                  setSide(next);
                }}
                layers={layers}
                catalog={catalog}
                onSaved={retry}
              />
            </ManualPaletteHue.Provider>
          )}
        </>
      ) : (
        !error && <p role="status">Reading lighting settings…</p>
      )}
    </section>
  );
}

function ProfileGrid({
  label,
  profiles,
  value,
  apply,
}: {
  label: string;
  profiles: Profile[];
  value: number;
  apply: (value: number) => void;
}) {
  return (
    <LightingChoiceGrid
      label={label}
      value={value}
      onChange={apply}
      choices={profiles.map((p) => ({
        id: p.id,
        name: p.name || `Preset ${p.id + 1} · ${p.renderer}`,
        icon: Lightbulb,
        renderer: p.renderer,
      }))}
    />
  );
}

function LightingRange({
  label,
  value,
  min,
  max,
  suffix = "",
  apply,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  apply: (v: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<number>();
  const pending = useRef<number>();
  const revision = useRef(0);
  const inFlight = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const write = useRef(apply);
  write.current = apply;
  const flush = useCallback(async function flush(commit = false) {
    clearTimeout(timer.current);
    timer.current = undefined;
    if ((!commit && inFlight.current > 0) || pending.current === undefined)
      return;
    const next = pending.current;
    const version = revision.current;
    pending.current = undefined;
    inFlight.current++;
    try {
      await write.current(next);
    } finally {
      inFlight.current--;
      if (version === revision.current) setDraft(undefined);
      if (pending.current !== undefined) void flush();
    }
  }, []);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      pending.current = undefined;
    },
    [],
  );
  return (
    <label className="lighting-control">
      <span>
        {label}{" "}
        <output>
          {draft ?? value}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={draft ?? value}
        onChange={(e) => {
          const next = Number(e.target.value);
          setDraft(next);
          pending.current = next;
          revision.current++;
          if (!timer.current) timer.current = setTimeout(flush, 80);
        }}
        onPointerUp={() => void flush(true)}
        onKeyUp={() => void flush(true)}
        onBlur={() => void flush(true)}
      />
    </label>
  );
}
