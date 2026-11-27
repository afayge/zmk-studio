import { useId } from "react";
import {
  Check,
  Activity,
  CloudRain,
  Keyboard,
  Rainbow,
  Shell,
  Sparkles,
  Blend,
  Waves,
  CircleDot,
  Fan,
  Droplets,
  ChevronsRight,
  Zap,
  Flame,
  Sun,
  Target,
  type LucideIcon,
} from "lucide-react";

const effectIcons = new Map<string, LucideIcon>([
  ["solid", Sun],
  ["breathe", Activity],
  ["spectrum", Rainbow],
  ["swirl", Shell],
  ["keypress", Keyboard],
  ["ripple", Target],
  ["rain", CloudRain],
  ["starlight", Sparkles],
  ["gradient", Blend],
  ["wave", Waves],
  ["radial", CircleDot],
  ["rotary", Fan],
  ["particles", Droplets],
  ["chase", ChevronsRight],
  ["reactive", Zap],
  ["heatmap", Flame],
]);

export interface LightingChoice {
  id: number;
  name: string;
  icon: LucideIcon;
  renderer?: string;
}

export function LightingChoiceGrid({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: LightingChoice[];
  value?: number;
  onChange: (id: number) => void;
}) {
  const groupName = useId();
  if (!choices.length) return null;
  return (
    <fieldset className="lighting-presets">
      <legend>{label}</legend>
      <div className="lighting-preset-grid">
        {choices.map(({ id, name, icon, renderer }) => {
          const Icon = effectIcons.get(renderer?.toLowerCase() ?? "") ?? icon;
          return (
            <label key={id} className="lighting-preset">
              <input
                type="radio"
                name={groupName}
                value={id}
                checked={value === id}
                onChange={() => onChange(id)}
              />
              <span className="lighting-preset-tile">
                <Icon aria-hidden="true" size={26} strokeWidth={1.7} />
                <span>{name}</span>
                {value === id && (
                  <Check
                    className="lighting-preset-check"
                    size={13}
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
