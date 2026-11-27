import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import {
  BehaviorBinding,
  Keymap,
  SetLayerBindingResponse,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { sameBinding } from "../behaviors/actions";
import { call_rpc } from "../rpc/logging";
import type { BindingChange } from "./snapshot";

// Keep interrupted operations across reconnects, only within this application session.
const interrupted = new Map<string, BindingChange[]>();
export const getInterrupted = (key: string) => interrupted.get(key);
export const clearInterrupted = (key: string) => interrupted.delete(key);

export class BindingWriteError extends Error {
  constructor(
    message: string,
    readonly changes: BindingChange[],
  ) {
    super(message);
  }
}

export function positionState(map: Keymap, c: BindingChange) {
  const binding = map.layers.find((l) => l.id === c.layerId)?.bindings[
    c.position
  ];
  if (binding && sameBinding(binding, c.after)) return "applied";
  if (binding && sameBinding(binding, c.before)) return "original";
  return "changed elsewhere";
}

const rejectionReason: Partial<Record<SetLayerBindingResponse, string>> = {
  [SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_LOCATION]:
    "This key position is unavailable.",
  [SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_BEHAVIOR]:
    "This keyboard does not support the selected behavior.",
  [SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_PARAMETERS]:
    "The keyboard rejected the binding parameters.",
};

async function readMap(conn: RpcConnection) {
  const map = (await call_rpc(conn, { keymap: { getKeymap: true } })).keymap
    ?.getKeymap;
  if (!map)
    throw Error(
      "Could not read the current keymap. Reconnect to check the affected keys.",
    );
  return map;
}

export async function writeChanges(
  conn: RpcConnection,
  journalKey: string | undefined,
  changes: BindingChange[],
  onWrite: (c: BindingChange, value: BehaviorBinding) => void,
  onRead: (map: Keymap) => void,
) {
  const map = await readMap(conn);
  onRead(map);
  if (changes.some((c) => positionState(map, c) === "changed elsewhere"))
    throw Error(
      "A target binding has changed. Review the current keyboard before applying again.",
    );
  if (journalKey && changes.length > 1) {
    const previous = getInterrupted(journalKey);
    if (previous && previous !== changes)
      throw Error(
        "Resume or dismiss the interrupted edit before starting another batch.",
      );
    interrupted.set(journalKey, changes);
  }
  for (const c of changes) {
    if (positionState(map, c) === "applied") {
      onWrite(c, c.after);
      continue;
    }
    try {
      const result = (
        await call_rpc(conn, {
          keymap: {
            setLayerBinding: {
              layerId: c.layerId,
              keyPosition: c.position,
              binding: c.after,
            },
          },
        })
      ).keymap?.setLayerBinding;
      if (result !== SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK) {
        throw Error(
          result === undefined
            ? "no acknowledgement"
            : rejectionReason[result] || "The keyboard rejected this binding.",
        );
      }
      onWrite(c, c.after);
    } catch (error) {
      try {
        onRead(await readMap(conn));
      } catch {
        /* Reconnect reloads the device state. */
      }
      throw new BindingWriteError(
        `Layer ${c.layerId}, key ${c.position + 1}: ${error instanceof Error ? error.message : String(error)}`,
        changes,
      );
    }
  }
  if (journalKey && getInterrupted(journalKey) === changes)
    clearInterrupted(journalKey);
}
