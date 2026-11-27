import { useLayoutEffect, useRef, useState } from "react";
import { useLocalStorageState } from "../misc/useLocalStorageState";

const minimum = 15;
const maximum = 85;
const defaultShare = 50;
const clamp = (n: number) =>
  Math.max(minimum, Math.min(maximum, Math.round(n)));
const storageOptions = {
  deserialize: (value: string) => {
    const n = Number(value);
    return value.trim() && Number.isFinite(n) ? clamp(n) : defaultShare;
  },
};

export function WorkbenchDivider() {
  const divider = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointer: number;
    startY: number;
    share: number;
    height: number;
  }>();
  const [saved, setSaved] = useLocalStorageState(
    "keyboardPanePercent",
    defaultShare,
    storageOptions,
  );
  const [preview, setPreview] = useState<number>();
  const share = preview ?? saved;

  useLayoutEffect(() => {
    const style = divider.current?.parentElement?.style;
    style?.setProperty(
      "--workbench-rows",
      `minmax(0, ${share}fr) auto minmax(0, ${100 - share}fr)`,
    );
    return () => {
      style?.removeProperty("--workbench-rows");
    };
  }, [share]);

  function pointerShare(y: number) {
    const start = drag.current!;
    return clamp(start.share + (100 * (y - start.startY)) / start.height);
  }

  return (
    <div
      ref={divider}
      className="workbench-divider"
      role="separator"
      tabIndex={0}
      aria-label="Keyboard preview height"
      aria-orientation="horizontal"
      aria-controls="keyboard-preview"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={share}
      aria-valuetext={`${share}%`}
      title="Drag or use the up and down arrows to resize"
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return;
        const handle = event.currentTarget;
        const pane = handle.ownerDocument.getElementById("keyboard-preview");
        if (!pane || !handle.parentElement) return;
        const height =
          handle.parentElement.getBoundingClientRect().bottom -
          pane.getBoundingClientRect().top -
          handle.getBoundingClientRect().height;
        if (height <= 0) return;
        handle.setPointerCapture(event.pointerId);
        drag.current = {
          pointer: event.pointerId,
          startY: event.clientY,
          share,
          height,
        };
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointer === event.pointerId)
          setPreview(pointerShare(event.clientY));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer === event.pointerId)
          setSaved(pointerShare(event.clientY));
      }}
      onLostPointerCapture={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current = undefined;
        setPreview(undefined);
      }}
      onKeyDown={(event) => {
        if (drag.current) return;
        let next: number;
        switch (event.key) {
          case "ArrowUp":
            next = share - 2;
            break;
          case "ArrowDown":
            next = share + 2;
            break;
          case "Home":
            next = minimum;
            break;
          case "End":
            next = maximum;
            break;
          default:
            return;
        }
        event.preventDefault();
        setSaved(clamp(next));
      }}
    />
  );
}
