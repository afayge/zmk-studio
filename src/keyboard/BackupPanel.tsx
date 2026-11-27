import { useRef, useState } from "react";
import { describe } from "../behaviors/actions";
import {
  BindingChange,
  previewSnapshot,
  snapshot,
  SnapshotContext,
} from "./snapshot";

export function BackupPanel({
  context,
  apply,
}: {
  context: SnapshotContext;
  apply: (changes: BindingChange[]) => void;
}) {
  const latestRead = useRef(0);
  const [source, setSource] = useState("");
  const [readError, setReadError] = useState("");
  let changes: BindingChange[] = [];
  let errors: string[] = [];
  if (source) {
    try {
      ({ changes, errors } = previewSnapshot(source, context));
    } catch (e) {
      errors = [e instanceof Error ? e.message : String(e)];
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(snapshot(context), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "zmk-keymap.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="tool-panel">
      <strong>Binding backup</strong>
      <p>
        Export all layers of the active layout, or preview a snapshot from this
        keyboard.
      </p>
      <div className="studio-tools">
        <button className="studio-button" onClick={download}>
          Export JSON
        </button>
        <label>
          Preview JSON{" "}
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const version = ++latestRead.current;
              const file = e.target.files?.[0];
              setReadError("");
              setSource("");
              if (!file) return;
              try {
                const content = await file.text();
                if (version !== latestRead.current) return;
                if (!content.trim()) throw Error("Empty snapshot.");
                setSource(content);
              } catch (err) {
                if (version === latestRead.current) setReadError(String(err));
              }
            }}
          />
        </label>
      </div>
      {readError && <p role="alert">{readError}</p>}
      {errors.map((e, i) => (
        <p role="alert" key={i}>
          {e}
        </p>
      ))}
      {source && !errors.length && (
        <>
          {context.keymap.layers.map((l) => {
            const diff = changes.filter((c) => c.layerId === l.id);
            return (
              diff.length > 0 && (
                <details key={l.id} open>
                  <summary>
                    {l.name || l.id} · {diff.length} changes
                  </summary>
                  {diff.map((c) => (
                    <p key={c.position}>
                      Key {c.position + 1} ·{" "}
                      {describe(
                        c.before,
                        context.behaviors[c.before.behaviorId],
                        context.keymap.layers,
                      )}{" "}
                      →{" "}
                      {describe(
                        c.after,
                        context.behaviors[c.after.behaviorId],
                        context.keymap.layers,
                      )}
                    </p>
                  ))}
                </details>
              )
            );
          })}
          {changes.length ? (
            <button className="studio-button" onClick={() => apply(changes)}>
              Apply {changes.length} changes
            </button>
          ) : (
            <p>Bindings match this keyboard.</p>
          )}
        </>
      )}
    </section>
  );
}
