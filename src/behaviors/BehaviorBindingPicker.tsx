import { identity, firstValue } from "./official";
import { validateValue } from "./parameters";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorParametersPicker } from "./BehaviorParametersPicker";
import {
  Action,
  commonActions,
  accepts,
  categories,
  Category,
  describe,
  DeviceBehavior,
  groupedResults,
  listActions,
  sameBinding,
} from "./actions";

import { useFocusable } from "@react-aria/focus";
import { Tooltip } from "../misc/Tooltip";
import { BasicKeyPalette } from "./BasicKeyPalette";
import { ActionIcon, IconName } from "./ActionIcon";

import { bindingGlyph } from "./actionGlyph";
import { BindingGlyph } from "./BindingGlyph";
import {
  isMatrix,
  matrixAvailable,
  matrixChoices,
  matrixCommands,
} from "./matrixActions";
import { MatrixBindingPicker } from "./MatrixBindingPicker";
import type { Catalog } from "../rpc/generated/lighting";

const categoryIcons: Record<Category, IconName> = {
  "Basic keys": "keyboard",
  Media: "media",
  Mouse: "mouse",
  Device: "output",
  "Special keys": "special",
  Lighting: "light",
  Macros: "macro",
  Shortcuts: "shortcut",
  Layers: "layers",
  "Tap / hold": "tap",
  "All behaviors": "all",
};

function PaletteActionButton({
  action,
  binding,
  choose,
}: {
  action: Action;
  binding?: BehaviorBinding;
  choose: (action: Action) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { focusableProps } = useFocusable({}, ref);
  return (
    <button
      {...focusableProps}
      ref={ref}
      type="button"
      aria-disabled={!binding || undefined}
      aria-label={action.label}
      aria-pressed={
        !!binding && !action.edit && sameBinding(action.binding, binding)
      }
      className="palette-action icon-key"
      onClick={() => binding && choose(action)}
    >
      <BindingGlyph glyph={action.glyph} edit={action.edit} />
    </button>
  );
}

export interface BehaviorBindingPickerProps {
  binding?: BehaviorBinding;
  behaviors: DeviceBehavior[];
  catalog?: Catalog;
  layers: { id: number; name: string }[];
  onBindingChanged: (binding: BehaviorBinding) => void;
}

export const BehaviorBindingPicker = ({
  binding,
  behaviors,
  catalog,
  layers,
  onBindingChanged,
}: BehaviorBindingPickerProps) => {
  const [query, setQuery] = useState("");
  const [requestedCategory, setCategory] = useState<Category>("Basic keys");
  const [draft, setDraft] = useState<BehaviorBinding>();
  const actions = useMemo(
    () => listActions(behaviors, layers, catalog),
    [behaviors, layers, catalog],
  );
  const supported = useMemo(
    () => new Set(actions.map((a) => a.category)),
    [actions],
  );
  const category = supported.has(requestedCategory)
    ? requestedCategory
    : categories.find((c) => supported.has(c)) ?? "All behaviors";
  const search = query.trim().toLowerCase();
  const results = useMemo(
    () => groupedResults(actions, category, search),
    [actions, category, search],
  );
  const current = behaviors.find((b) => b.id === binding?.behaviorId);
  const editing = behaviors.find((b) => b.id === draft?.behaviorId);
  const common = useMemo(
    () => commonActions(actions, /Mac|iPhone|iPad/.test(navigator.platform)),
    [actions],
  );
  useEffect(() => {
    setDraft(undefined);
  }, [binding?.behaviorId, binding?.param1, binding?.param2]);

  const preview = draft && bindingGlyph(draft, editing);
  const matrixDraft =
    draft &&
    editing &&
    isMatrix(identity(editing).name) &&
    matrixCommands[draft.param1];
  function choose(action: Action) {
    if (!binding) return;
    if (action.edit)
      setDraft(
        binding.behaviorId === action.binding.behaviorId &&
          (action.category === "All behaviors" ||
            binding.param1 === action.binding.param1)
          ? binding
          : action.binding,
      );
    else {
      setDraft(undefined);
      if (!sameBinding(binding, action.binding))
        onBindingChanged(action.binding);
    }
  }

  function actionButton(action: Action) {
    const key = [
      action.binding.behaviorId,
      action.label,
      action.binding.param1,
      action.binding.param2,
    ].join("/");
    return (
      <Tooltip key={key} label={action.label} delay={400}>
        <PaletteActionButton
          action={action}
          binding={binding}
          choose={choose}
        />
      </Tooltip>
    );
  }
  return (
    <section className="action-panel" aria-label="Key actions">
      <nav className="palette-nav" aria-label="Action categories">
        <div className="palette-links">
          {categories
            .filter((c) => supported.has(c) || c === "All behaviors")
            .map((c) => (
              <button
                key={c}
                aria-pressed={!search && category === c}
                onClick={() => {
                  setCategory(c);
                  setQuery("");
                  setDraft(undefined);
                }}
              >
                <ActionIcon name={categoryIcons[c]} />
                {c}
              </button>
            ))}
        </div>
        <label className="palette-search">
          <ActionIcon name="search" />
          <input
            type="search"
            aria-label="Search actions"
            placeholder="Search actions…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDraft(undefined);
            }}
          />
        </label>
      </nav>
      <div className="palette-main">
        <div className="panel-title">
          <h2>
            {draft && editing
              ? "Binding parameters"
              : search
                ? "Search results"
                : category}
          </h2>
          {binding?.behaviorId === -1 ? (
            <span>Inherit from lower layers</span>
          ) : binding ? (
            <button
              className="binding-inspector"
              onClick={() => setDraft(binding)}
              aria-label="Edit parameters"
              title="Edit parameters"
            >
              {describe(binding, current, layers, catalog)}{" "}
              <ActionIcon name="edit" />
            </button>
          ) : (
            <span className="palette-hint">
              Select a key on the keyboard above.
            </span>
          )}
        </div>
        {binding && draft && editing ? (
          <div className="action-draft">
            <strong className="binding-preview">
              {preview && <BindingGlyph glyph={preview} />}{" "}
              {describe(draft, editing, layers, catalog)}
            </strong>
            {matrixDraft ? (
              <MatrixBindingPicker
                binding={draft}
                behavior={editing}
                catalog={catalog}
                change={setDraft}
              />
            ) : (
              <BehaviorParametersPicker
                metadata={editing.metadata}
                layers={layers}
                param1={draft.param1}
                param2={draft.param2}
                onParam1Changed={(v) => {
                  const ids = layers.map((l) => l.id),
                    n = v ?? NaN;
                  const sets = editing.metadata.filter((s) =>
                    validateValue(ids, n, s.param1),
                  );
                  const keep = sets.some((s) =>
                    validateValue(ids, draft.param2, s.param2),
                  );
                  setDraft({
                    ...draft,
                    param1: n,
                    param2: keep
                      ? draft.param2
                      : firstValue(sets[0]?.param2 ?? [], ids),
                  });
                }}
                onParam2Changed={(v) =>
                  setDraft({ ...draft, param2: v ?? NaN })
                }
              />
            )}
            <button
              className="studio-button"
              disabled={
                (!!matrixDraft &&
                  (!matrixAvailable(draft.param1, catalog) ||
                    !matrixChoices(editing, draft.param1, catalog).has(
                      draft.param2,
                    ))) ||
                !accepts(
                  editing,
                  layers.map((l) => l.id),
                  draft,
                ) ||
                sameBinding(binding, draft)
              }
              onClick={() => {
                onBindingChanged(draft);
                setDraft(undefined);
              }}
            >
              Apply binding
            </button>
            <button
              className="studio-button"
              onClick={() => setDraft(undefined)}
            >
              Cancel
            </button>
          </div>
        ) : category === "Basic keys" && !search && supported.has(category) ? (
          <BasicKeyPalette
            actions={actions}
            binding={binding}
            choose={choose}
          />
        ) : (
          <div
            className="action-results"
            role="region"
            aria-label="Matching actions"
          >
            {results.map(({ category: tab, group, entries }) => (
              <section
                key={JSON.stringify([tab, group])}
                aria-label={group}
                className="action-group"
              >
                <h3>
                  {search && <span>{tab} · </span>}
                  {group}
                </h3>
                <div className="action-keys">{entries.map(actionButton)}</div>
              </section>
            ))}
            {!results.length && <p>No matching actions for this keyboard.</p>}
          </div>
        )}
      </div>
      {!!common.length && (
        <aside className="palette-common" aria-label="Common actions">
          <h2>Common actions</h2>
          <div>{common.map(actionButton)}</div>
        </aside>
      )}
    </section>
  );
};
