import { useContext, useEffect, useState } from "react";
import type { GetBehaviorDetailsResponse } from "./generated/behaviors";
import type {
  Keymap,
  PhysicalLayouts,
} from "./generated/keymap";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ConnectionContext } from "./ConnectionContext";
import { LockStateContext } from "./LockStateContext";
import { call_rpc } from "./logging";

export function useKeyboardData() {
  const { conn } = useContext(ConnectionContext);
  const lock = useContext(LockStateContext);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [keymap, setKeymap] = useState<Keymap>();
  const [physical, setPhysical] = useState<PhysicalLayouts>();
  const [selectedPhysicalLayoutIndex, setSelectedPhysicalLayoutIndex] =
    useState(0);
  const [behaviors, setBehaviors] = useState<
    Record<number, GetBehaviorDetailsResponse>
  >({});

  useEffect(() => {
    if (!conn || lock !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) return;
    const connection = conn;
    let active = true;
    async function load() {
      setError("");
      const layouts = (
        await call_rpc(connection, { keymap: { getPhysicalLayouts: true } })
      ).keymap?.getPhysicalLayouts;
      if (!active) return;
      const map = (await call_rpc(connection, { keymap: { getKeymap: true } }))
        .keymap?.getKeymap;
      if (!active) return;
      const ids = (
        await call_rpc(connection, { behaviors: { listAllBehaviors: true } })
      ).behaviors?.listAllBehaviors?.behaviors;
      if (!layouts?.layouts[layouts.activeLayoutIndex] || !map || !ids)
        throw Error("Incomplete keyboard configuration.");
      const catalog: Record<number, GetBehaviorDetailsResponse> = {};
      for (const behaviorId of ids) {
        if (!active) return;
        const details = (
          await call_rpc(connection, {
            behaviors: { getBehaviorDetails: { behaviorId } },
          })
        ).behaviors?.getBehaviorDetails;
        if (!details) throw Error(`Could not read behavior ${behaviorId}.`);
        catalog[details.id] = details;
      }
      if (active) {
        setBehaviors(catalog);
        setSelectedPhysicalLayoutIndex(layouts.activeLayoutIndex);
        setPhysical(layouts);
        setKeymap(map);
      }
    }
    void load().catch((e) => {
      if (active) setError(String(e));
    });
    return () => {
      active = false;
    };
  }, [conn, lock, attempt]);

  return {
    keymap,
    setKeymap,
    layouts: physical?.layouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
    behaviors,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}
