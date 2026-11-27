import { BindingGlyph } from "./BindingGlyph";
import type { Action } from "./actions";
import {
  paletteKeys,
  compactLegends,
  stackedLegends,
} from "./keyPaletteLayout";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { sameBinding } from "./actions";

export function BasicKeyPalette({
  actions,
  binding,
  choose,
}: {
  actions: Action[];
  binding?: BehaviorBinding;
  choose: (action: Action) => void;
}) {
  const keys = new Map(
    actions
      .filter((a) => a.category === "Basic keys")
      .map((a) => [a.binding.param1 & 0xffff, a]),
  );
  return (
    <div
      className="reference-scroll"
      role="region"
      aria-label="Basic key keyboard"
      tabIndex={0}
    >
      <div className="reference-board">
        {paletteKeys.map(({ usage, x, y, width, height }) => {
          const action = keys.get(usage);
          if (!action) return null;
          const legends = stackedLegends[usage];
          return (
            <button
              key={usage}
              className="reference-key"
              aria-label={action.label}
              disabled={!binding}
              aria-pressed={!!binding && sameBinding(binding, action.binding)}
              title={action.label}
              style={{
                gridColumn: `${x * 4 + 1} / span ${width * 4}`,
                gridRow: `${y + 1} / span ${height}`,
              }}
              onClick={() => choose(action)}
            >
              {legends ? (
                <>
                  <small>{legends[0]}</small>
                  <span>{legends[1]}</span>
                </>
              ) : action.glyph.icon !== "keycap" ? (
                <BindingGlyph glyph={action.glyph} />
              ) : (
                compactLegends[usage] || action.glyph.mark || action.label
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
