import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { PhysicalLayout as Layout } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { Kind, unassigned, type Directory } from "../rpc/lightingEditor";
import { colorBackground, ManualPaletteHue } from "./firmwareColors";
import { PhysicalLayout } from "./PhysicalLayout";

import type { ExtraLedEdit } from "./ExtraLedRail";

export const LedCanvas = createContext<
  | {
      canvas: HTMLElement | null;
      sideToolbar: HTMLElement | null;
      layout: Layout;
      index: number;
      setExtraEdit: (edit?: ExtraLedEdit) => void;
    }
  | undefined
>(undefined);

export function LedCanvasNotice({ children }: { children: React.ReactNode }) {
  const canvas = useContext(LedCanvas)?.canvas;
  return canvas
    ? createPortal(
        <div className="led-canvas-notice" role="status">
          {children}
        </div>,
        canvas,
      )
    : null;
}

export function LedPositionPicker({
  side,
  directory,
  groupKey,
  members,
  colors,
  disabled,
  change,
}: {
  side: number;
  directory: Directory;
  groupKey: number;
  members: number[];
  colors?: number[];
  disabled: boolean;
  change: (next: number[]) => void;
}) {
  const context = useContext(LedCanvas);
  const hue = useContext(ManualPaletteHue);
  const changeRef = useRef(change);
  useLayoutEffect(() => {
    changeRef.current = change;
  }, [change]);
  const register = context?.setExtraEdit;
  useLayoutEffect(() => {
    if (!register) return;
    register({
      side,
      directory,
      groupKey,
      members,
      disabled,
      change: (next) => changeRef.current(next),
    });
    return () => register(undefined);
  }, [register, side, directory, groupKey, members, disabled]);
  const topology = directory.topology;
  if (!context?.canvas || !topology) return null;
  const { layout, canvas } = context;
  const zone = (groupKey >> 8) & 255;
  function ownerName(led: number) {
    const owner = topology!.leds[led].owner;
    if (groupKey >> 16 !== Kind.Zone || owner === unassigned || owner === zone)
      return "";
    return (
      directory.groups.find((g) => g.key >> 8 === ((Kind.Zone << 8) | owner))
        ?.label || `Zone ${owner + 1}`
    );
  }
  function toggle(led: number) {
    if (!disabled && led >= 0 && (members.includes(led) || !ownerName(led)))
      change(
        members.includes(led)
          ? members.filter((id) => id !== led)
          : [...members, led],
      );
  }
  function swatch(led: number | undefined) {
    if (led === undefined || !colors || !members.includes(led)) return null;
    const color = colors[colors.length === 1 ? 0 : members.indexOf(led)];
    return color !== undefined ? (
      <i
        aria-hidden="true"
        className="led-color-swatch"
        style={{ background: colorBackground(color, hue) }}
      />
    ) : null;
  }
  const byPosition = new Map<number, number>();
  topology.leds.forEach(({ position }, led) => {
    if (position !== unassigned && position < layout.keys.length)
      byPosition.set(position, led);
  });
  const positions = layout.keys.map((k, i) => {
    const led = byPosition.get(i),
      owner = led === undefined ? "" : ownerName(led);
    const description =
      led === undefined ? "No LED" : `LED ${led}${owner ? " · " + owner : ""}`;
    return {
      id: String(i),
      x: k.x / 100,
      y: k.y / 100,
      width: k.width / 100,
      height: k.height / 100,
      r: k.r / 100,
      rx: k.rx / 100,
      ry: k.ry / 100,
      description,
      disabled:
        disabled || led === undefined || (!!owner && !members.includes(led)),
      target: led !== undefined && members.includes(led),
      children: (
        <span title={description}>
          {swatch(led)}
          {led ?? "–"}
          {owner && <small className="led-owner">{owner}</small>}
        </span>
      ),
    };
  });
  return createPortal(
    <section className="led-position-map" aria-label="Logical LED locations">
      <div className="led-key-grid">
        <PhysicalLayout
          positions={positions}
          zoom="auto"
          onPositionClicked={(i) => toggle(byPosition.get(i) ?? -1)}
        />
      </div>
    </section>,
    canvas,
  );
}
