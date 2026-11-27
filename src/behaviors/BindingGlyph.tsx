import { ActionIcon } from "./ActionIcon";
import type { ActionGlyph } from "./actionGlyph";
export function BindingGlyph({
  glyph,
  edit = false,
}: {
  glyph: ActionGlyph;
  edit?: boolean;
}) {
  return (
    <span
      className="action-glyph"
      data-keycap={glyph.icon === "keycap" || undefined}
      data-long={(glyph.mark?.length ?? 0) > 6 || undefined}
      aria-hidden="true"
    >
      <ActionIcon name={glyph.icon} />
      {glyph.mark && <span className="glyph-mark">{glyph.mark}</span>}
      {edit && (
        <span className="glyph-edit">
          <ActionIcon name="edit" />
        </span>
      )}
    </span>
  );
}
