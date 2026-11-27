import { useContext, useState } from "react";
import {
  Button,
  Dialog,
  DialogTrigger,
  Header,
  Menu,
  MenuItem,
  Popover,
  Section,
} from "react-aria-components";
import { Check, ChevronDown } from "lucide-react";
import {
  colorBackground,
  firmwareColors,
  firmwareColorGroups,
  hexColor,
  parseCustomRgb,
  ManualPaletteHue,
} from "./firmwareColors";

export function FirmwareColorPicker({
  value,
  label,
  mixed = false,
  custom = false,
  onChange,
}: {
  value: number;
  label: string;
  mixed?: boolean;
  custom?: boolean;
  onChange: (value: number) => void;
}) {
  const hue = useContext(ManualPaletteHue);
  const current = mixed
    ? undefined
    : firmwareColors.find((c) => c.value === value);
  const name = mixed ? "Mixed colors" : current?.name ?? hexColor(value);
  return (
    <DialogTrigger>
      <Button
        className="studio-button firmware-color-trigger"
        aria-label={`${label} · Firmware colors · ${name}`}
      >
        <i
          aria-hidden="true"
          className="firmware-swatch"
          style={{
            background: mixed ? undefined : colorBackground(value, hue),
          }}
        />
        {name}
        <ChevronDown size={14} aria-hidden="true" />
      </Button>
      <Popover className="firmware-colors-popover" placement="bottom start">
        <Dialog aria-label={label + " firmware colors"}>
          {({ close }) => {
            const choose = (next: number) => {
              onChange(next);
              close();
            };
            return (
              <>
                <strong>Firmware colors</strong>
                {custom && <CustomRgb value={value} onChoose={choose} />}
                <Menu
                  aria-label="Firmware colors"
                  onAction={(key) => {
                    const color = firmwareColors.find((c) => c.macro === key);
                    if (color) choose(color.value);
                  }}
                >
                  {firmwareColorGroups.map((group) => (
                    <Section key={group.name} aria-label={group.name}>
                      <Header>{group.name}</Header>
                      {group.colors.map((c) => (
                        <MenuItem
                          key={c.macro}
                          id={c.macro}
                          textValue={c.name}
                          className="firmware-color-option"
                        >
                          <i
                            className="firmware-swatch"
                            aria-hidden="true"
                            style={{
                              background: colorBackground(c.value, hue),
                            }}
                          />
                          <span>
                            {c.name}
                            <code>{c.macro}</code>
                          </span>
                          {current?.macro === c.macro && (
                            <Check aria-label="Current color" size={15} />
                          )}
                        </MenuItem>
                      ))}
                    </Section>
                  ))}
                </Menu>
              </>
            );
          }}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

function CustomRgb({
  value,
  onChoose,
}: {
  value: number;
  onChoose: (value: number) => void;
}) {
  const [input, setInput] = useState(value <= 0xffffff ? hexColor(value) : "");
  const text = input.trim();
  const rgb = parseCustomRgb(text);
  return (
    <div className="firmware-custom-rgb">
      <input
        type="color"
        aria-label="Pick custom RGB"
        value={hexColor(rgb ?? 0xffffff)}
        onChange={(e) => setInput(e.target.value)}
      />
      <input
        aria-label="Custom HEX or RGB"
        placeholder="#RRGGBB or R, G, B"
        value={input}
        aria-invalid={!!text && rgb === undefined}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (rgb !== undefined) onChoose(rgb);
          }
        }}
      />
      <button
        type="button"
        className="studio-button"
        disabled={rgb === undefined}
        onClick={() => rgb !== undefined && onChoose(rgb)}
      >
        Use color
      </button>
    </div>
  );
}
