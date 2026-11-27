import { FirmwareColorPicker } from "./FirmwareColorPicker";
import {
  colorBackground,
  firmwareColors,
  hexColor,
  ManualPaletteHue,
  parseCustomRgb,
} from "./firmwareColors";
import { useContext, useRef, useState } from "react";
import {
  ColorArea,
  ColorPicker,
  ColorSlider,
  ColorThumb,
  SliderTrack,
  parseColor,
  type Color,
} from "react-aria-components";
import { ChevronDown, Pipette } from "lucide-react";
import { useRecentColors } from "./useRecentColors";
import { Field, type Group } from "../rpc/lightingEditor";

export type QuickColorDraft = {
  revision: number;
  target: number;
  color: number;
};

type Format = "HEX" | "RGB";

function rgbValue(color: Color) {
  return Number.parseInt(color.toString("hex").slice(1), 16);
}

function formatColor(color: Color, format: Format) {
  if (format === "HEX") return color.toString("hex").toLowerCase();
  const rgb = color.toFormat("rgb");
  return [
    rgb.getChannelValue("red"),
    rgb.getChannelValue("green"),
    rgb.getChannelValue("blue"),
  ].join(", ");
}

export function CustomPresetColor({
  presetName,
  group,
  draft,
  remember,
  save,
  reload,
}: {
  presetName: string;
  group: Group;
  draft?: QuickColorDraft;
  remember: (draft?: QuickColorDraft) => void;
  save: (led: number, value: number) => Promise<void>;
  reload: () => void;
}) {
  const savedDraft = draft?.revision === group.revision ? draft : undefined;
  const [selected, select] = useState<number | undefined>(savedDraft?.target);
  const [format, setFormat] = useState<Format>("HEX");
  const [open, setOpen] = useState(!!savedDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const colors = group.values[Field.Primary];
  if (!Array.isArray(colors)) return null;
  const target =
    selected === -1 || (selected !== undefined && group.leds.includes(selected))
      ? selected
      : colors.length > 1
        ? group.leds[0]
        : -1;
  const index =
    target === -1 || colors.length === 1 ? 0 : group.leds.indexOf(target);
  const value = colors[index] ?? 0;
  async function apply(color: number) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await save(target, color);
      remember();
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      className="custom-color"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <Pipette size={16} aria-hidden="true" />
        Custom color
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      {open && (
        <fieldset className="custom-color-card" disabled={busy}>
          <legend>Main preset · {presetName}</legend>
          {group.leds.length > 0 && (
            <label>
              Target LED{" "}
              <select
                aria-label="Target LED"
                value={target}
                onChange={(e) => select(Number(e.target.value))}
              >
                <option value={-1}>All LEDs</option>
                {group.leds.map((led) => (
                  <option key={led} value={led}>
                    LED {led}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ColorControls
            key={`${target}/${group.revision}`}
            picked={
              savedDraft?.target === target ? savedDraft.color : undefined
            }
            onPick={(color) =>
              remember({ revision: group.revision, target, color })
            }
            value={value}
            format={format}
            setFormat={setFormat}
            busy={busy}
            mixed={target === -1 && colors.some((c) => c !== value)}
            apply={apply}
          />
          {error && (
            <div role="alert">
              {error}{" "}
              <button type="button" className="studio-button" onClick={reload}>
                Read preset again
              </button>
            </div>
          )}
        </fieldset>
      )}
    </details>
  );
}

function ColorControls({
  value,
  picked,
  onPick,
  format,
  setFormat,
  busy,
  mixed,
  apply,
}: {
  value: number;
  picked?: number;
  onPick: (color: number) => void;
  format: Format;
  setFormat: (format: Format) => void;
  busy: boolean;
  mixed: boolean;
  apply: (color: number) => Promise<void>;
}) {
  const hue = useContext(ManualPaletteHue);
  const [edited, setEdited] = useState<Color>();
  const selected = picked ?? value;
  const color =
    edited ??
    (selected <= 0xffffff
      ? parseColor(hexColor(selected))
      : parseColor(`hsb(${hue}, 100%, 100%)`));
  const [input, setInput] = useState<string>();
  const { recentColors, recordColor } = useRecentColors();
  const parsedInput =
    input === undefined ? undefined : parseCustomRgb(input, format);
  const valid = input === undefined || parsedInput !== undefined;
  function selectColor(next: number) {
    onPick(next);
    setEdited(undefined);
    setInput(undefined);
    recordColor(next);
  }
  function finishAdjustment(next: Color) {
    recordColor(rgbValue(next));
  }
  function finishInput() {
    if (parsedInput !== undefined) recordColor(parsedInput);
  }
  return (
    <ColorPicker
      value={color}
      onChange={(next) => {
        setEdited(next);
        onPick(rgbValue(next));
        setInput(undefined);
      }}
    >
      <FirmwareColorPicker
        label="Current main preset"
        value={selected}
        mixed={mixed && picked === undefined}
        onChange={selectColor}
      />
      {recentColors.length > 0 && (
        <fieldset className="recent-colors">
          <legend>Recent colors</legend>
          <div>
            {recentColors.map((recent) => {
              const label =
                recent <= 0xffffff
                  ? hexColor(recent)
                  : firmwareColors.find((c) => c.value === recent)!.name;
              return (
                <button
                  key={recent}
                  type="button"
                  className="studio-button"
                  aria-pressed={
                    !(mixed && picked === undefined) && recent === selected
                  }
                  onClick={() => selectColor(recent)}
                >
                  <i
                    aria-hidden="true"
                    className="firmware-swatch"
                    style={{ background: colorBackground(recent, hue) }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <ColorArea
        onChangeEnd={finishAdjustment}
        aria-label="Saturation and brightness"
        colorSpace="hsb"
        xChannel="saturation"
        yChannel="brightness"
        className="custom-color-area"
        isDisabled={busy}
      >
        <ColorThumb className="custom-color-thumb" />
      </ColorArea>
      <ColorSlider
        onChangeEnd={finishAdjustment}
        aria-label="Custom color hue"
        colorSpace="hsb"
        channel="hue"
        isDisabled={busy}
      >
        <SliderTrack className="custom-color-track">
          <ColorThumb className="custom-color-thumb" />
        </SliderTrack>
      </ColorSlider>
      <div className="custom-color-fields">
        <label className="custom-color-format">
          <select
            aria-label="Color format"
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as Format);
              setInput(undefined);
            }}
          >
            <option>HEX</option>
            <option>RGB</option>
          </select>
          <ChevronDown size={13} aria-hidden="true" />
        </label>
        <input
          aria-label={format + " color"}
          onBlur={finishInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              finishInput();
            }
          }}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!valid}
          placeholder={format === "HEX" ? "#RRGGBB" : "R, G, B"}
          value={
            input ??
            ((mixed && picked === undefined) || selected > 0xffffff
              ? ""
              : formatColor(color, format))
          }
          onChange={(e) => {
            const text = e.target.value;
            setInput(text);
            const parsed = parseCustomRgb(text, format);
            if (parsed !== undefined) {
              setEdited(parseColor(hexColor(parsed)));
              onPick(parsed);
            }
          }}
        />
      </div>
      {!valid && (
        <small role="status">
          {format === "HEX"
            ? "Enter a 3- or 6-digit hex color."
            : "Enter three values from 0 to 255, separated by commas."}
        </small>
      )}
      <div className="custom-color-actions">
        <button
          type="button"
          className="studio-button"
          disabled={
            !valid ||
            picked === undefined ||
            (!mixed && picked === value) ||
            busy
          }
          onClick={() => picked !== undefined && void apply(picked)}
        >
          {busy ? "Applying…" : "Apply to preset"}
        </button>
      </div>
    </ColorPicker>
  );
}
