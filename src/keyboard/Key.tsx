import { PropsWithChildren } from "react";
import { Button } from "react-aria-components";
import { Tooltip } from "../misc/Tooltip";
import BehaviorShortNames from "./behavior-short-names.json";

interface KeyProps {
  selected?: boolean;
  disabled?: boolean;
  position?: number;
  description?: string;
  tooltip?: string;
  modified?: boolean;
  target?: boolean;
  width: number;
  height: number;
  oneU: number;
  header?: string;
  onClick?: () => void;
  onPressChange?: (pressed: boolean) => void;
}

interface BehaviorShortName {
  short?: string;
}

const MAX_HEADER_LENGTH = 9;
const shortNames: Record<string, BehaviorShortName> = BehaviorShortNames;

const shortenHeader = (header: string | undefined) => {
  if (typeof header === "undefined") {
    return "";
  }
  // Empty string is a valid header for behaviors where we don't want to see a header, which is falsy
  // So we use an undefined check here
  if (typeof shortNames[header]?.short !== "undefined") {
    return shortNames[header].short;
  } else if (header.length > MAX_HEADER_LENGTH) {
    const words = header.split(/[\s,-]+/);
    const lettersPerWord = Math.trunc(MAX_HEADER_LENGTH / words.length);
    return words.map((word) => word.substring(0, lettersPerWord)).join("");
  } else {
    return header;
  }
};

export const Key = ({
  selected = false,
  disabled,
  position,
  description,
  modified,
  target,
  tooltip,
  width,
  height,
  oneU,
  header,
  onClick,
  onPressChange,
  children,
}: PropsWithChildren<KeyProps>) => {
  const label =
    position === undefined
      ? header
      : `Key ${position + 1} · ${description || header || ""}${modified ? " · modified" : ""}`;
  const pixelWidth = width * oneU - 2;
  const pixelHeight = height * oneU - 2;

  const attributes = {
    className: `group rounded relative flex justify-center items-center cursor-pointer transition-all hover:shadow-xl hover:ring-1 hover:ring-gray-300 hover:scale-125 ${selected ? "bg-primary text-primary-content" : "bg-base-100 text-base-content"}`,
    "data-position": position,
    "data-modified": modified || undefined,
    "data-target": target || undefined,
    "aria-label": label,
    "aria-pressed": Boolean(target || selected),
    style: { width: pixelWidth, height: pixelHeight },
  };
  const contents = (
    <>
      <div className="absolute text-xs opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center">
        {shortenHeader(header)}
      </div>
      {children}
    </>
  );
  if (tooltip)
    return (
      <Tooltip label={tooltip} delay={400}>
        <Button
          isDisabled={disabled}
          {...attributes}
          onPress={onClick}
          onPressChange={onPressChange}
        >
          {contents}
        </Button>
      </Tooltip>
    );
  if (onPressChange)
    return (
      <Button
        isDisabled={disabled}
        {...attributes}
        onPress={onClick}
        onPressChange={onPressChange}
      >
        {contents}
      </Button>
    );
  return (
    <button
      type="button"
      disabled={disabled}
      {...attributes}
      title={label}
      onClick={onClick}
    >
      {contents}
    </button>
  );
};
