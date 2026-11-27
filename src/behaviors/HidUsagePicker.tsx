import {
  Button,
  Checkbox,
  CheckboxGroup,
  Collection,
  ComboBox,
  Header,
  Input,
  Key,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Section,
} from "react-aria-components";
import { hid_usage_page_get_ids } from "../hid-usages";
import { hexCode, keyIndex, keyName } from "./keyPress";
import { useCallback, useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface HidUsagePage {
  id: number;
  min?: number;
  max?: number;
}

export interface HidUsagePickerProps {
  label?: string;
  value?: number;
  usagePages: HidUsagePage[];
  onValueChanged: (value?: number) => void;
}

function inPageRange(page: HidUsagePage, usage: number) {
  if (page.id === 7 && usage >= 0xe0 && usage <= 0xe7) return true;
  return usage >= (page.min ?? 0) && usage <= (page.max ?? 0xffff);
}

const UsageSection = ({ id, min, max }: HidUsagePage) => {
  const info = useMemo(() => hid_usage_page_get_ids(id), [id]);

  const usages = useMemo(() => {
    const options = new Map<number, string>();
    for (const usage of info?.UsageIds ?? []) {
      options.set((id << 16) | usage.Id, usage.Name);
    }
    for (const value of Object.keys(keyIndex).map(Number)) {
      if (((value >>> 16) & 255) === id && !options.has(value))
        options.set(value, keyName(value));
    }
    return [...options].flatMap(([code, name]) => {
      const usage = code & 0xffff;
      if (!inPageRange({ id, min, max }, usage)) return [];
      return [{ code, name, aliases: keyIndex[code]?.[0] ?? "" }];
    });
  }, [id, min, max, info]);

  return (
    <Section id={id}>
      <Header className="text-base-content/50">{info?.Name}</Header>
      <Collection items={usages}>
        {(i) => (
          <ListBoxItem
            className="rac-hover:bg-base-300 pl-3 relative rac-focus:bg-base-300 cursor-default select-none rac-selected:before:content-['✔'] before:absolute before:left-[0] before:top-[0]"
            textValue={[i.name, i.aliases].filter(Boolean).join(" · ")}
            id={i.code}
          >
            {i.name} {i.aliases.split(" ")[0]}
          </ListBoxItem>
        )}
      </Collection>
    </Section>
  );
};

enum Mods {
  LeftControl = 0x01,
  LeftShift = 0x02,
  LeftAlt = 0x04,
  LeftGUI = 0x08,
  RightControl = 0x10,
  RightShift = 0x20,
  RightAlt = 0x40,
  RightGUI = 0x80,
}

const mod_labels: Record<Mods, string> = {
  [Mods.LeftControl]: "L Ctrl",
  [Mods.LeftShift]: "L Shift",
  [Mods.LeftAlt]: "L Alt",
  [Mods.LeftGUI]: "L GUI",
  [Mods.RightControl]: "R Ctrl",
  [Mods.RightShift]: "R Shift",
  [Mods.RightAlt]: "R Alt",
  [Mods.RightGUI]: "R GUI",
};

const all_mods = [
  Mods.LeftControl,
  Mods.LeftShift,
  Mods.LeftAlt,
  Mods.LeftGUI,
  Mods.RightControl,
  Mods.RightShift,
  Mods.RightAlt,
  Mods.RightGUI,
];

function mods_to_flags(mods: Mods[]): number {
  return mods.reduce((a, v) => a + v, 0);
}

function mask_mods(value: number) {
  return value & ~(mods_to_flags(all_mods) << 24);
}

export const HidUsagePicker = ({
  label,
  value,
  usagePages,
  onValueChanged,
}: HidUsagePickerProps) => {
  const labelId = useId();
  const [raw, setRaw] = useState(() => {
    if (!value) return false;
    const page = usagePages.find((p) => p.id === ((value >>> 16) & 255));
    const usage = value & 0xffff;
    if (!page || !inPageRange(page, usage)) return true;
    return (
      !keyIndex[value & 0xffffff] &&
      !hid_usage_page_get_ids(page.id)?.UsageIds.some((u) => u.Id === usage)
    );
  });
  const [rawText, setRawText] = useState<string>();
  function inputRaw(text: string) {
    setRawText(text);
    const valid = /^(?:0x[0-9a-f]{1,8}|[0-9]{1,10})$/i.test(text.trim());
    const n = Number(text.trim());
    onValueChanged(valid && n <= 0xffffffff ? n : undefined);
  }
  const mods = useMemo(() => {
    const flags = value ? value >>> 24 : 0;

    return all_mods.filter((m) => m & flags).map((m) => m.toLocaleString());
  }, [value]);

  const selectionChanged = useCallback(
    (e: Key | null) => {
      let value = typeof e == "number" ? e : undefined;
      if (value !== undefined) {
        const mod_flags = mods_to_flags(mods.map((m) => parseInt(m)));
        value = (value | (mod_flags << 24)) >>> 0;
      }

      onValueChanged(value);
    },
    [onValueChanged, mods],
  );

  const modifiersChanged = useCallback(
    (m: string[]) => {
      if (!value) {
        return;
      }

      const mod_flags = mods_to_flags(m.map((m) => parseInt(m)));
      const new_value = mask_mods(value) | (mod_flags << 24);
      setRawText(undefined);
      onValueChanged(new_value >>> 0);
    },
    [value, onValueChanged],
  );

  return (
    <div className="flex flex-wrap gap-2 relative">
      {label && <Label id={labelId}>{label}:</Label>}
      <label>
        <input
          type="checkbox"
          checked={raw}
          onChange={(e) => {
            setRaw(e.target.checked);
            setRawText(undefined);
          }}
        />{" "}
        Encoded HID value
      </label>
      {raw ? (
        <input
          aria-label="HID code"
          spellCheck={false}
          value={rawText ?? (value ? hexCode(value) : "")}
          placeholder="0x00070004"
          onChange={(e) => inputRaw(e.target.value)}
        />
      ) : (
        <ComboBox
          selectedKey={
            value ? (keyIndex[value] ? value : mask_mods(value)) : null
          }
          onSelectionChange={selectionChanged}
          aria-label={label || "HID usage"}
          aria-labelledby={label ? labelId : undefined}
        >
          <div className="flex">
            <Input className="p-1 rounded-l" />
            <Button className="rounded-r bg-primary text-primary-content w-8 h-8 flex justify-center items-center">
              <ChevronDown className="size-4" />
            </Button>
          </div>
          <Popover className="w-[var(--trigger-width)] max-h-4 shadow-md text-base-content rounded border-base-content bg-base-100">
            <ListBox
              items={usagePages}
              className="block max-h-[30vh] min-h-[unset] overflow-auto p-2"
              selectionMode="single"
            >
              {({ id, min, max }) => (
                <UsageSection id={id} min={min} max={max} />
              )}
            </ListBox>
          </Popover>
        </ComboBox>
      )}
      <CheckboxGroup
        aria-label="Implicit Modifiers"
        className="flex flex-wrap gap-px rounded-md"
        value={mods}
        onChange={modifiersChanged}
      >
        {all_mods.map((m) => (
          <Checkbox
            key={m}
            value={m.toLocaleString()}
            className="text-nowrap cursor-pointer grid px-2 content-center justify-center rac-selected:bg-primary border-base-100 bg-base-300 hover:bg-base-100 first:rounded-s-md last:rounded-e-md rac-selected:text-primary-content"
          >
            {mod_labels[m]}
          </Checkbox>
        ))}
      </CheckboxGroup>
    </div>
  );
};
