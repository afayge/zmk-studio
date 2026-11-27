import { useState } from "react";
import type { BehaviorParameterValueDescription as Description } from "../rpc/generated/behaviors";
import { HidUsagePicker } from "./HidUsagePicker";
import { axes, firstValue, packAxes } from "./official";
import { validateValue } from "./parameters";

export interface ParameterValuePickerProps {
  value?: number;
  values: Description[];
  layers: { id: number; name: string }[];
  onValueChanged: (value?: number) => void;
}

function PackedFields({
  value = 0,
  hsb,
  change,
}: {
  value?: number;
  hsb: boolean;
  change: (n?: number) => void;
}) {
  const fields = hsb
    ? ["Hue (°)", "Saturation (%)", "Brightness (%)"]
    : ["X", "Y"];
  const decode = (n: number) =>
    hsb ? [n >>> 16, (n >>> 8) & 255, n & 255] : axes(n);
  const [invalid, setInvalid] = useState<string[]>();
  const parts = invalid ?? decode(value).map(String);
  return (
    <div className="binding-fields">
      {fields.map((name, i) => {
        const min = hsb ? 0 : -32768,
          max = hsb ? (i === 0 ? 360 : 100) : 32767;
        return (
          <label key={name}>
            {name}
            <input
              type="number"
              min={min}
              max={max}
              value={parts[i]}
              onChange={(e) => {
                const next = parts.map((s, j) =>
                  i === j ? e.target.value : s,
                );
                const valid = next.every(
                  (s, j) =>
                    s.trim() !== "" &&
                    Number.isInteger(Number(s)) &&
                    Number(s) >= min &&
                    Number(s) <= (hsb ? (j === 0 ? 360 : 100) : 32767),
                );
                setInvalid(valid ? undefined : next);
                const [x, y, z] = next.map(Number);
                change(
                  valid
                    ? hsb
                      ? (x << 16) | (y << 8) | z
                      : packAxes(x, y)
                    : undefined,
                );
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

export function ParameterValuePicker({
  value,
  values,
  layers,
  onValueChanged,
}: ParameterValuePickerProps) {
  const [choice, setChoice] = useState<number>();
  const ids = layers.map((l) => l.id);
  if (!values.length) return null;
  if (values.every((v) => v.constant !== undefined)) {
    const unique = new Map(values.map((v) => [v.constant!, v.name]));
    return (
      <label>
        Command
        <select
          value={value ?? ""}
          onChange={(e) => onValueChanged(Number(e.target.value))}
        >
          {!unique.has(value!) && (
            <option value={value ?? ""} disabled>
              Select a value
            </option>
          )}
          {[...unique].map(([id, name]) => (
            <option key={id} value={id}>
              {name || id}
            </option>
          ))}
        </select>
      </label>
    );
  }
  // Some macros expose several distinct value types in the same parameter.
  const idx =
    choice ??
    Math.max(
      0,
      values.findIndex((v) => validateValue(ids, value, [v])),
    );
  const v = values[idx] ?? values[0];
  return (
    <div className="binding-fields">
      {values.length > 1 && (
        <label>
          Value type
          <select
            value={idx}
            onChange={(e) => {
              const next = Number(e.target.value);
              setChoice(next);
              if (!validateValue(ids, value, [values[next]]))
                onValueChanged(firstValue([values[next]], ids));
            }}
          >
            {values.map((opt, i) => (
              <option value={i} key={i}>
                {opt.name || Object.keys(opt).find((k) => k !== "name")}
              </option>
            ))}
          </select>
        </label>
      )}
      {v.signedAxes || v.hsb ? (
        <PackedFields value={value} hsb={!!v.hsb} change={onValueChanged} />
      ) : v.range ? (
        <label>
          {v.name || "Value"}
          <input
            type="number"
            min={v.range.min}
            max={v.range.max}
            value={Number.isFinite(value) ? value : ""}
            onChange={(e) => onValueChanged(e.target.valueAsNumber)}
          />
        </label>
      ) : v.hidUsage ? (
        <HidUsagePicker
          label={v.name || "Keycode"}
          value={value}
          onValueChanged={onValueChanged}
          usagePages={[
            { id: 7, min: 4, max: v.hidUsage.keyboardMax },
            { id: 12, max: v.hidUsage.consumerMax },
          ]}
        />
      ) : v.layerId ? (
        <label>
          {v.name || "Layer"}
          <select
            value={value}
            onChange={(e) => onValueChanged(Number(e.target.value))}
          >
            {!ids.includes(value!) && (
              <option value={value} disabled>
                Select a layer
              </option>
            )}
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name || l.id}
              </option>
            ))}
          </select>
        </label>
      ) : v.constant !== undefined || v.nil ? (
        <button type="button" onClick={() => onValueChanged(v.constant ?? 0)}>
          {v.name || "Use default"}
        </button>
      ) : (
        <span>Unsupported parameter · {value}</span>
      )}
    </div>
  );
}
