import { useMemo } from "react";
import { previewGrid, type MatrixPreview } from "./matrixPreview";
import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { BindingGlyph } from "../behaviors/BindingGlyph";
import type { Catalog } from "../rpc/generated/lighting";
import { bindingGlyph } from "../behaviors/actionGlyph";
import { bindingExplanation } from "../behaviors/bindingExplanation";
import { describe } from "../behaviors/actions";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export interface KeymapProps {
  layout: PhysicalLayout;
  catalog?: Catalog;
  preview?: MatrixPreview;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  marked?: Set<number>;
  targets?: number[];
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  onKeyPositionClicked: (keyPosition: number) => void;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  catalog,
  preview,
  marked,
  targets,
  selectedLayerIndex,
  selectedKeyPosition,
  onKeyPositionClicked,
}: KeymapProps) => {
  const grid = useMemo(() => previewGrid(layout.keys), [layout.keys]);
  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  const layerBindings = keymap.layers[selectedLayerIndex].bindings;
  const positions = layout.keys.map((k, i) => {
    const binding = layerBindings[i];
    const behavior = binding && behaviors[binding.behaviorId];
    const tooltip = bindingExplanation(
      binding,
      behavior,
      keymap.layers,
      catalog,
    );
    if (!binding) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "Unknown",
        r: (k.r || 0) / 100,
        rx: (k.rx || 0) / 100,
        ry: (k.ry || 0) / 100,
        tooltip,
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <span></span>,
      };
    }

    const glyph = bindingGlyph(binding, behavior);
    const summary = describe(binding, behavior, keymap.layers, catalog);
    const layer = keymap.layers.find((l) => l.id === binding.param1);
    let legend = summary;
    if (/^(mod|layer)[ -]?tap$/i.test(behavior?.displayName || ""))
      legend = summary
        .replace(/^Tap /, "")
        .split(", hold")
        .join(" /")
        .replace(" for ", " ");
    else if (
      behavior?.metadata.some((set) => set.param1.some((v) => v.layerId))
    )
      legend = layer?.name || String(binding.param1);
    else if (behavior?.displayName === "Transparent") legend = "▽";
    else if (behavior?.displayName === summary) legend = "";
    return {
      description: summary,
      tooltip,
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header: behavior?.displayName || "Unknown",
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      modified: marked?.has(i),
      target: targets?.includes(i),
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children: glyph ? (
        <BindingGlyph glyph={glyph} />
      ) : (
        <span className={legend.length > 4 ? "key-legend" : undefined}>
          {legend}
        </span>
      ),
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      preview={preview}
      grid={grid}
      oneU={48}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
    />
  );
};
