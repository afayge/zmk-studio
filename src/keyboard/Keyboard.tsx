import { ActionIcon } from "../behaviors/ActionIcon";
import { describe } from "../behaviors/actions";
import { BindingGlyph } from "../behaviors/BindingGlyph";
import { bindingGlyph } from "../behaviors/actionGlyph";
import type { EncoderDirection } from "../rpc/generated/keymap";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { call_rpc } from "../rpc/logging";
import {
  Keymap,
  SetLayerPropsResponse,
  BehaviorBinding,
  Layer,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { LayerPicker } from "./LayerPicker";
import { PhysicalLayoutPicker } from "./PhysicalLayoutPicker";
import { Keymap as KeymapComp } from "./Keymap";
import { ExtraLedRail, type ExtraLedEdit } from "./ExtraLedRail";
import { WorkbenchDivider } from "./WorkbenchDivider";
import { useKeyboardData } from "../rpc/useKeyboardData";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { UndoRedoContext } from "../undoRedo";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { LedCanvas } from "./LedPositionPicker";
import { LightingPanel } from "./LightingPanel";
import { useMatrixLighting } from "../rpc/useMatrixLighting";
import { LightingSupport } from "../rpc/generated/core";
import { BackupPanel } from "./BackupPanel";
import { OutputTest } from "./OutputTest";
import { BindingChange, layoutSignature } from "./snapshot";
import {
  BindingWriteError,
  clearInterrupted,
  getInterrupted,
  positionState,
  writeChanges,
} from "./bindingWrites";
import { sameBinding } from "../behaviors/actions";
import { produce } from "immer";
import { deserializeLayoutZoom, LayoutZoom } from "./PhysicalLayout";
import { useLocalStorageState } from "../misc/useLocalStorageState";

export default function Keyboard({
  device,
  lightingSupport,
  savedRevision,
  failure,
}: {
  device?: string;
  lightingSupport: LightingSupport;
  savedRevision: number;
  failure?: { cause: unknown; retry: () => void };
}) {
  const {
    keymap,
    setKeymap,
    layouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
    behaviors,
    error,
    retry,
  } = useKeyboardData();

  const [extraEdit, setExtraEdit] = useState<ExtraLedEdit>();
  const [sideToolbar, setSideToolbar] = useState<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  const [keymapScale, setKeymapScale] = useLocalStorageState<LayoutZoom>(
    "keymapScale",
    "auto",
    {
      deserialize: deserializeLayoutZoom,
    },
  );

  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0);
  const [selectedKeyPosition, setSelectedKeyPosition] = useState<
    number | undefined
  >(undefined);

  const conn = useContext(ConnectionContext);
  const undoRedo = useContext(UndoRedoContext);

  useEffect(() => {
    setSelectedLayerIndex(0);
    setSelectedKeyPosition(undefined);
  }, [conn]);

  const [tool, setTool] = useState<
    "edit" | "lighting" | "backup" | "batch" | "test"
  >("edit");
  const lighting = useMatrixLighting(
    lightingSupport,
    selectedPhysicalLayoutIndex,
    keymap?.layers[selectedLayerIndex]?.id,
    layouts?.[selectedPhysicalLayoutIndex]?.keys.length,
  );
  const { catalog } = lighting;
  const [targets, setTargets] = useState<number[]>([]);
  const [batchMode, setBatchMode] = useState("copy");
  const [originals, setOriginals] = useState<Record<string, BehaviorBinding>>(
    {},
  );
  const [, refreshJournal] = useState(0);
  const layout = layouts?.[selectedPhysicalLayoutIndex];
  const journalKey =
    device && layout
      ? JSON.stringify([device, layoutSignature(layout)])
      : undefined;
  const pending = journalKey ? getInterrupted(journalKey) : undefined;
  const layer = keymap?.layers[selectedLayerIndex];
  const [rotation, setRotation] = useState<{
    layerId: number;
    sensor: number;
    side: "clockwise" | "counterclockwise";
  }>();
  const direction =
    rotation && layer?.id === rotation.layerId
      ? layer.encoderMap?.encoders[rotation.sensor]?.[rotation.side]
      : undefined;
  const inherited: BehaviorBinding = { behaviorId: -1, param1: 0, param2: 0 };
  function changeEncoder(binding?: BehaviorBinding) {
    const connection = conn.conn;
    if (!connection || !rotation || !direction) return;
    const { layerId, sensor, side } = rotation;
    async function write(value?: BehaviorBinding) {
      const response = await call_rpc(connection!, {
        keymap: {
          setEncoderBinding: {
            layerId,
            sensorIndex: sensor,
            counterclockwise: side === "counterclockwise",
            ...(value ? { binding: value } : { restore: true }),
          },
        },
      });
      if (response.keymap?.setEncoderBinding !== 0)
        throw Error("The keyboard rejected this encoder binding.");
      const map = (await call_rpc(connection!, { keymap: { getKeymap: true } }))
        .keymap?.getKeymap;
      const actual = map?.layers.find((l) => l.id === layerId)?.encoderMap
        ?.encoders[sensor]?.[side];
      if (!map || !actual)
        throw Error(
          "Could not read the encoder binding back from the keyboard.",
        );
      setKeymap(map);
      if (
        value
          ? !actual.overridden ||
            !actual.binding ||
            !sameBinding(actual.binding, value)
          : actual.overridden
      )
        throw Error("Encoder binding differs from the requested change.");
    }
    const previous = direction.overridden ? direction.binding : undefined;
    void undoRedo?.(async () => {
      await write(binding);
      return () => write(previous);
    });
  }
  const behaviorList = useMemo(() => Object.values(behaviors), [behaviors]);
  const layerOptions = useMemo(
    () =>
      keymap?.layers.map(({ id, name }, i) => ({
        id,
        name: name || String(i),
      })) || [],
    [keymap],
  );
  function encoderButton(
    sensor: number,
    side: "clockwise" | "counterclockwise",
    entry: EncoderDirection | undefined,
  ) {
    const b = entry?.binding,
      behavior = b && behaviors[b.behaviorId];
    const glyph = b && bindingGlyph(b, behavior);
    const title = side === "clockwise" ? "Clockwise" : "Counterclockwise";
    const summary = b
      ? describe(b, behavior, layerOptions, catalog)
      : entry
        ? "Inherit"
        : "Unavailable";
    return (
      <button
        type="button"
        disabled={!entry}
        aria-label={`Encoder ${sensor + 1} · ${title} · ${summary}`}
        title={summary}
        aria-pressed={
          !!rotation &&
          rotation.layerId === layer?.id &&
          rotation.sensor === sensor &&
          rotation.side === side
        }
        onClick={() => {
          setSelectedKeyPosition(undefined);
          setRotation({ layerId: layer!.id, sensor, side });
        }}
      >
        <ActionIcon name={side} />
        {glyph && <BindingGlyph glyph={glyph} />}
        <span className="encoder-direction-label">
          <span>{title}</span>
          <small>{summary}</small>
        </span>
      </button>
    );
  }
  const transparent = behaviorList.find((b) => b.displayName === "Transparent");
  useEffect(() => {
    setOriginals({});
  }, [savedRevision]);
  useEffect(() => {
    setTargets([]);
    setRotation(undefined);
  }, [selectedLayerIndex, selectedPhysicalLayoutIndex, tool]);

  function doSelectPhysicalLayout(index: number) {
    const previous = selectedPhysicalLayoutIndex;
    const connection = conn.conn;
    if (index === previous || !connection) return;
    async function select(i: number) {
      const result = (
        await call_rpc(connection!, { keymap: { setActivePhysicalLayout: i } })
      ).keymap?.setActivePhysicalLayout;
      if (!result?.ok) throw Error("Could not switch the physical layout.");
      setSelectedPhysicalLayoutIndex(i);
      setSelectedKeyPosition(undefined);
      setKeymap(result.ok);
    }
    void undoRedo?.(async () => {
      await select(index);
      return () => select(previous);
    });
  }

  function applyChanges(changes: BindingChange[]) {
    const connection = conn.conn;
    if (!connection || !changes.length) return;
    const apply = (items: BindingChange[]) =>
      writeChanges(
        connection,
        journalKey,
        items,
        (c, binding) => {
          const id = [selectedPhysicalLayoutIndex, c.layerId, c.position].join(
            "/",
          );
          setOriginals((previous) =>
            previous[id] ? previous : { ...previous, [id]: c.before },
          );
          setKeymap(
            produce((draft: Keymap | undefined) => {
              const target = draft?.layers.find((l) => l.id === c.layerId);
              if (target) target.bindings[c.position] = binding;
            }),
          );
        },
        setKeymap,
      );
    void undoRedo?.(async () => {
      await apply(changes);
      const inverse = changes.map((c) => ({
        ...c,
        before: c.after,
        after: c.before,
      }));
      return () => apply(inverse);
    });
  }

  function doUpdateBinding(binding: BehaviorBinding) {
    if (!layer || selectedKeyPosition === undefined) return;
    const before = layer.bindings[selectedKeyPosition];
    if (!sameBinding(before, binding))
      applyChanges([
        {
          layerId: layer.id,
          position: selectedKeyPosition,
          before,
          after: binding,
        },
      ]);
  }

  const selectedBinding = useMemo(() => {
    if (
      keymap == null ||
      selectedKeyPosition == null ||
      !keymap.layers[selectedLayerIndex]
    ) {
      return null;
    }

    return keymap.layers[selectedLayerIndex].bindings[selectedKeyPosition];
  }, [keymap, selectedLayerIndex, selectedKeyPosition]);

  const moveLayer = useCallback(
    (start: number, end: number) => {
      const doMove = async (startIndex: number, destIndex: number) => {
        if (!conn.conn) {
          return;
        }

        let resp = await call_rpc(conn.conn, {
          keymap: { moveLayer: { startIndex, destIndex } },
        });

        if (resp.keymap?.moveLayer?.ok) {
          setKeymap(resp.keymap?.moveLayer?.ok);
          setSelectedLayerIndex(destIndex);
        } else {
          throw Error("The keyboard could not move the layer.");
        }
      };

      undoRedo?.(async () => {
        await doMove(start, end);
        return () => doMove(end, start);
      });
    },
    [undoRedo, conn, setKeymap],
  );

  const addLayer = useCallback(() => {
    async function doAdd(): Promise<number> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, { keymap: { addLayer: {} } });

      if (resp.keymap?.addLayer?.ok) {
        const newSelection = keymap.layers.length;
        setKeymap(
          produce((draft: any) => {
            draft.layers.push(resp.keymap!.addLayer!.ok!.layer);
            draft.availableLayers--;
          }),
        );

        setSelectedLayerIndex(newSelection);

        return resp.keymap.addLayer.ok.index;
      } else {
        console.error("Add error", resp.keymap?.addLayer?.err);
        throw new Error("Failed to add layer:" + resp.keymap?.addLayer?.err);
      }
    }

    async function doRemove(layerIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      console.log(resp);
      if (resp.keymap?.removeLayer?.ok) {
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          }),
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err,
        );
      }
    }

    undoRedo?.(async () => {
      let index = await doAdd();
      return () => doRemove(index);
    });
  }, [conn, undoRedo, keymap]);

  const removeLayer = useCallback(() => {
    async function doRemove(layerIndex: number): Promise<void> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      if (resp.keymap?.removeLayer?.ok) {
        if (layerIndex == keymap.layers.length - 1) {
          setSelectedLayerIndex(layerIndex - 1);
        }
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          }),
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err,
        );
      }
    }

    async function doRestore(layerId: number, atIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { restoreLayer: { layerId, atIndex } },
      });

      console.log(resp);
      if (resp.keymap?.restoreLayer?.ok) {
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(atIndex, 0, resp!.keymap!.restoreLayer!.ok);
            draft.availableLayers--;
          }),
        );
        setSelectedLayerIndex(atIndex);
      } else {
        console.error("Remove error", resp.keymap?.restoreLayer?.err);
        throw new Error(
          "Failed to restore layer:" + resp.keymap?.restoreLayer?.err,
        );
      }
    }

    if (!keymap) {
      throw new Error("No keymap loaded");
    }

    let index = selectedLayerIndex;
    let layerId = keymap.layers[index].id;
    undoRedo?.(async () => {
      await doRemove(index);
      return () => doRestore(layerId, index);
    });
  }, [conn, undoRedo, selectedLayerIndex, keymap]);

  const changeLayerName = useCallback(
    (id: number, oldName: string, newName: string) => {
      async function changeName(layerId: number, name: string) {
        if (!conn.conn) {
          throw new Error("Not connected");
        }

        const resp = await call_rpc(conn.conn, {
          keymap: { setLayerProps: { layerId, name } },
        });

        if (
          resp.keymap?.setLayerProps ==
          SetLayerPropsResponse.SET_LAYER_PROPS_RESP_OK
        ) {
          setKeymap(
            produce((draft: any) => {
              const layer_index = draft.layers.findIndex(
                (l: Layer) => l.id == layerId,
              );
              draft.layers[layer_index].name = name;
            }),
          );
        } else {
          throw new Error(
            "Failed to change layer name:" + resp.keymap?.setLayerProps,
          );
        }
      }

      undoRedo?.(async () => {
        await changeName(id, newName);
        return async () => {
          await changeName(id, oldName);
        };
      });
    },
    [conn, undoRedo, keymap],
  );

  useEffect(() => {
    if (!keymap?.layers) return;

    const layers = keymap.layers.length - 1;

    if (selectedLayerIndex > layers) {
      setSelectedLayerIndex(layers);
    }
  }, [keymap, selectedLayerIndex]);

  if (error)
    return (
      <div className="studio-error" role="alert">
        {error}{" "}
        <button className="studio-button" onClick={retry}>
          Retry loading
        </button>
      </div>
    );
  if (!layout || !keymap)
    return (
      <p className="tool-panel" role="status">
        Loading keyboard…
      </p>
    );
  return (
    <div className="keyboard-workbench bg-base-300">
      <div className="p-2 flex flex-col gap-2 bg-base-200 keyboard-sidebar">
        {layouts?.length ? (
          <div className="col-start-3 row-start-1 row-end-2">
            <PhysicalLayoutPicker
              layouts={layouts}
              selectedPhysicalLayoutIndex={selectedPhysicalLayoutIndex}
              onPhysicalLayoutClicked={doSelectPhysicalLayout}
            />
          </div>
        ) : null}

        {keymap && (
          <div className="col-start-1 row-start-1 row-end-2">
            <LayerPicker
              layers={keymap.layers}
              selectedLayerIndex={selectedLayerIndex}
              onLayerClicked={setSelectedLayerIndex}
              onLayerMoved={moveLayer}
              canAdd={(keymap.availableLayers || 0) > 0}
              canRemove={(keymap.layers?.length || 0) > 1}
              onAddClicked={addLayer}
              onRemoveClicked={removeLayer}
              onLayerNameChanged={changeLayerName}
            />
          </div>
        )}
        {tool === "edit" &&
          layer?.encoderMap?.encoders.map((e, i) => (
            <section
              className="encoder-controls"
              key={i}
              aria-label={`Encoder ${i + 1}`}
            >
              <strong>Encoder {i + 1}</strong>
              {encoderButton(i, "clockwise", e.clockwise)}
              {encoderButton(i, "counterclockwise", e.counterclockwise)}
            </section>
          ))}
      </div>
      {layout && keymap && (
        <div id="keyboard-preview" className="keyboard-preview">
          {tool === "lighting" && (
            <div className="lighting-side-toolbar" ref={setSideToolbar} />
          )}
          <div className="keyboard-stage">
            <ExtraLedRail
              flank="left"
              lighting={lighting}
              keyCount={layout.keys.length}
              edit={extraEdit}
            />
            <div className="keyboard-canvas" ref={setCanvas}>
              <KeymapComp
                preview={lighting.preview}
                catalog={catalog}
                keymap={keymap}
                layout={layout}
                behaviors={behaviors}
                scale={keymapScale}
                selectedLayerIndex={selectedLayerIndex}
                selectedKeyPosition={selectedKeyPosition}
                marked={
                  new Set(
                    layer?.bindings.flatMap((binding, position) => {
                      const original =
                        originals[
                          [
                            selectedPhysicalLayoutIndex,
                            layer.id,
                            position,
                          ].join("/")
                        ];
                      return original && !sameBinding(original, binding)
                        ? [position]
                        : [];
                    }),
                  )
                }
                targets={tool === "batch" ? targets : []}
                onKeyPositionClicked={(position) => {
                  if (!layer?.bindings[position]) return;
                  if (tool === "batch")
                    setTargets((current) =>
                      current.includes(position)
                        ? current.filter((p) => p !== position)
                        : [...current, position],
                    );
                  else {
                    setRotation(undefined);
                    setSelectedKeyPosition(position);
                  }
                }}
              />
              <select
                className="absolute top-2 right-2 h-8 rounded px-2"
                aria-label="Keymap zoom"
                value={keymapScale}
                onChange={(e) => {
                  const value = deserializeLayoutZoom(e.target.value);
                  setKeymapScale(value);
                }}
              >
                <option value="auto">Auto</option>
                <option value={0.25}>25%</option>
                <option value={0.5}>50%</option>
                <option value={0.75}>75%</option>
                <option value={1}>100%</option>
                <option value={1.25}>125%</option>
                <option value={1.5}>150%</option>
                <option value={2}>200%</option>
              </select>
            </div>
            <ExtraLedRail
              flank="right"
              lighting={lighting}
              keyCount={layout.keys.length}
              edit={extraEdit}
            />
          </div>
        </div>
      )}
      {layer && <WorkbenchDivider />}
      {keymap && layout && layer && (
        <div className="workbench-controls">
          <nav
            aria-label="Keyboard tools"
            className="panel-tabs workspace-tabs"
          >
            {(["edit", "lighting", "backup", "batch", "test"] as const).map(
              (t, i) => (
                <button
                  key={t}
                  aria-pressed={tool === t}
                  onClick={() => setTool(t)}
                >
                  {
                    [
                      "Key actions",
                      "Lighting",
                      "Backup",
                      "Batch edit",
                      "Output test",
                    ][i]
                  }
                </button>
              ),
            )}
          </nav>
          {pending && (
            <div className="studio-error">
              <strong>Interrupted edit</strong>
              <p>
                {pending
                  .map(
                    (c) =>
                      `Layer ${c.layerId}, key ${c.position + 1}: ${positionState(keymap, c)}`,
                  )
                  .join(" · ")}
              </p>
              <button
                className="studio-button"
                disabled={pending.some(
                  (c) => positionState(keymap, c) === "changed elsewhere",
                )}
                onClick={() => {
                  if (
                    failure?.cause instanceof BindingWriteError &&
                    failure.cause.changes === pending
                  )
                    failure.retry();
                  else applyChanges(pending);
                }}
              >
                Resume edit
              </button>
              <button
                className="studio-button"
                onClick={() => {
                  clearInterrupted(journalKey!);
                  refreshJournal((n) => n + 1);
                }}
              >
                Dismiss report
              </button>
            </div>
          )}
          {tool === "edit" && direction?.overridden && (
            <button className="studio-button" onClick={() => changeEncoder()}>
              Restore default direction
            </button>
          )}
          {tool === "edit" && (
            <BehaviorBindingPicker
              catalog={catalog}
              key={[
                layer.id,
                selectedKeyPosition,
                rotation?.sensor,
                rotation?.side,
                selectedPhysicalLayoutIndex,
              ].join("/")}
              binding={
                direction
                  ? direction.binding ?? inherited
                  : selectedBinding ?? undefined
              }
              behaviors={behaviorList}
              layers={layerOptions}
              onBindingChanged={direction ? changeEncoder : doUpdateBinding}
            />
          )}
          {tool === "backup" &&
            (device && Object.keys(behaviors).length ? (
              <BackupPanel
                context={{ device, layout, keymap, behaviors }}
                apply={applyChanges}
              />
            ) : (
              <p className="tool-panel">
                Backup requires a device identifier and a loaded behavior list.
              </p>
            ))}
          {tool === "lighting" && (
            <LedCanvas.Provider
              value={{
                canvas,
                sideToolbar,
                setExtraEdit,
                layout,
                index: selectedPhysicalLayoutIndex,
              }}
            >
              <LightingPanel
                lighting={lighting}
                support={lightingSupport}
                device={device}
                layers={layerOptions}
              />
            </LedCanvas.Provider>
          )}
          {tool === "test" && <OutputTest />}
          {tool === "batch" && (
            <section className="tool-panel">
              <strong>Batch edit · {layer.name || layer.id}</strong>
              <p>
                Choose an operation, then select its target keys on the layout.
              </p>
              <div className="studio-tools">
                <select
                  aria-label="Batch operation"
                  value={batchMode}
                  onChange={(e) => setBatchMode(e.target.value)}
                >
                  <option value="copy">Copy a binding</option>
                  <option value="transparent" disabled={!transparent}>
                    Set transparent
                  </option>
                </select>
                {batchMode === "copy" && (
                  <label>
                    Source key{" "}
                    <select
                      aria-label="Source key"
                      value={selectedKeyPosition ?? ""}
                      onChange={(e) =>
                        setSelectedKeyPosition(Number(e.target.value))
                      }
                    >
                      <option value="" disabled>
                        Select a key
                      </option>
                      {layer.bindings.map((_, i) => (
                        <option value={i} key={i}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  className="studio-button"
                  disabled={
                    !targets.length ||
                    (batchMode === "copy" ? !selectedBinding : !transparent)
                  }
                  onClick={() => {
                    const after =
                      batchMode === "copy"
                        ? selectedBinding
                        : transparent && {
                            behaviorId: transparent.id,
                            param1: 0,
                            param2: 0,
                          };
                    if (!after) return;
                    applyChanges(
                      targets
                        .filter((p) => !sameBinding(layer.bindings[p], after))
                        .map((position) => ({
                          layerId: layer.id,
                          position,
                          before: layer.bindings[position],
                          after,
                        })),
                    );
                  }}
                >
                  Apply to {targets.length} keys
                </button>
                <button
                  className="studio-button"
                  onClick={() => setTargets([])}
                >
                  Clear selection
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
