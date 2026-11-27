import { AppHeader } from "./AppHeader";

import { createStudioConnection } from "./rpc/connection";
import { LightingSupport } from "./rpc/generated/core";
import { call_rpc } from "./rpc/logging";

import type { Notification } from "@zmkfirmware/zmk-studio-ts-client/studio";
import { ConnectionContext } from "./rpc/ConnectionContext";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { SaveChangesErrorCode } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { createDemoConnection } from "./rpc/demo";
import { useConnectedDeviceData } from "./rpc/useConnectedDeviceData";
import {
  ConnectModal,
  type TransportFactory,
  type TransportKind,
} from "./ConnectModal";

import { connect as gatt_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import {
  connect as tauri_ble_connect,
  list_devices as ble_list_devices,
} from "./tauri/ble";
import {
  connect as tauri_serial_connect,
  list_devices as serial_list_devices,
} from "./tauri/serial";
import Keyboard from "./keyboard/Keyboard";
import { UndoRedoContext, useUndoRedo } from "./undoRedo";
import { publish, useSub } from "./usePubSub";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "./rpc/LockStateContext";
import { UnlockModal } from "./UnlockModal";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";
import { valueAfter } from "./misc/async";
import { AppFooter } from "./AppFooter";
import { AboutModal } from "./AboutModal";
import { LicenseNoticeModal } from "./misc/LicenseNoticeModal";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
  }
}

const TRANSPORTS: TransportFactory[] = [];
if (window.__TAURI_INTERNALS__) {
  TRANSPORTS.push(
    {
      label: "BLE",
      pick_and_connect: { connect: tauri_ble_connect, list: ble_list_devices },
    },
    {
      label: "USB",
      pick_and_connect: {
        connect: tauri_serial_connect,
        list: serial_list_devices,
      },
    },
  );
} else {
  if (navigator.serial)
    TRANSPORTS.push({ label: "USB", connect: serial_connect });
  if (navigator.bluetooth && navigator.userAgent.includes("Linux"))
    TRANSPORTS.push({ label: "BLE", connect: gatt_connect });
}

async function listen_for_notifications(
  notification_stream: ReadableStream<Notification>,
  signal: AbortSignal,
): Promise<void> {
  const reader = notification_stream.getReader();
  const onAbort = () => {
    void reader.cancel();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      console.log("Notification", value);
      publish("rpc_notification", value);

      const subsystem = Object.entries(value).find(([, v]) => v !== undefined);
      if (!subsystem) {
        continue;
      }

      const [subId, subData] = subsystem;
      const event = Object.entries(subData).find(([, v]) => v !== undefined);

      if (!event) {
        continue;
      }

      const [eventName, eventData] = event;
      const topic = ["rpc_notification", subId, eventName].join(".");

      publish(topic, eventData);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

interface DeviceSession {
  conn: RpcConnection;
  name: string;
  identity?: string;
  demo: boolean;
  lightingSupport: LightingSupport;
  abort: AbortController;
}

function App() {
  const [session, setSession] = useState<DeviceSession>();
  const [connectionError, setConnectionError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const pending = useRef(false);
  async function attach(
    kind: TransportKind | "Demo",
    openConnection: (
      signal: AbortSignal,
    ) => RpcConnection | Promise<RpcConnection>,
  ) {
    if (pending.current) return;
    pending.current = true;
    const abort = new AbortController();
    setConnecting(true);
    setConnectionError("");
    try {
      const conn = await openConnection(abort.signal);
      const result = await Promise.race([
        call_rpc(conn, { core: { getDeviceInfo: true } }),
        valueAfter(undefined, 1500),
      ]);
      if (kind === "USB" && result === undefined)
        throw Error(
          "串口已打开，键盘未回复。若同时连接了蓝牙，请用键盘的 OUT_USB 键切换到 USB 输出，再重试。",
        );
      const info = result?.core?.getDeviceInfo;
      if (!info)
        throw Error(
          "Could not read keyboard information. Reconnect and try again.",
        );
      const serial = Array.from(info.serialNumber).join(".");
      const demo = kind === "Demo";
      const identity = demo
        ? "studio-demo"
        : serial
          ? JSON.stringify([info.name, serial])
          : undefined;
      setSession({
        conn,
        abort,
        name: info.name,
        identity,
        demo,
        lightingSupport: info.lightingSupport,
      });
      void listen_for_notifications(conn.notification_readable, abort.signal)
        .catch(() => undefined)
        .finally(() =>
          setSession((current) =>
            current?.conn === conn ? undefined : current,
          ),
        );
    } catch (error) {
      abort.abort();
      if (
        !(error instanceof UserCancelledError) &&
        !(error instanceof DOMException && error.name === "NotFoundError")
      )
        setConnectionError(
          error instanceof Error ? error.message : String(error),
        );
    } finally {
      pending.current = false;
      setConnecting(false);
    }
  }
  const [revision, setRevision] = useState(0);
  const connection = useMemo(
    () => ({ conn: session?.conn || null }),
    [session],
  );
  return (
    <ConnectionContext.Provider value={connection}>
      <ConnectModal
        open={!session}
        transports={TRANSPORTS}
        busy={connecting}
        error={connectionError}
        onConnect={(kind, open) =>
          void attach(kind, async (signal) =>
            createStudioConnection(await open(), signal),
          )
        }
        onDemo={() => void attach("Demo", createDemoConnection)}
      />
      {session && (
        <Session
          key={session.conn.label + revision}
          session={session}
          reload={() => setRevision((n) => n + 1)}
        />
      )}
    </ConnectionContext.Provider>
  );
}

function Session({
  session,
  reload,
}: {
  session: DeviceSession;
  reload: () => void;
}) {
  const [lockState, setLockState] = useState(
    LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED,
  );
  useSub("rpc_notification.core.lockStateChanged", setLockState);
  useEffect(() => {
    let ignore = false;
    void call_rpc(session.conn, { core: { getLockState: true } })
      .then((r) => {
        if (!ignore && r.core?.getLockState !== undefined)
          setLockState(r.core.getLockState);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [session]);
  return (
    <LockStateContext.Provider value={lockState}>
      <UnlockModal />
      <Editor key={lockState} session={session} reload={reload} />
    </LockStateContext.Provider>
  );
}

const saveErrors: Partial<Record<SaveChangesErrorCode, string>> = {
  [SaveChangesErrorCode.SAVE_CHANGES_ERR_NO_SPACE]: "Keyboard storage is full.",
  [SaveChangesErrorCode.SAVE_CHANGES_ERR_NOT_SUPPORTED]:
    "This firmware does not support saving changes.",
};

function Editor({
  session,
  reload,
}: {
  session: DeviceSession;
  reload: () => void;
}) {
  const history = useUndoRedo();
  const [showAbout, setShowAbout] = useState(false);
  const [showLicenseNotice, setShowLicenseNotice] = useState(false);
  const [savedRevision, setSavedRevision] = useState(0);
  const [unsaved, setUnsaved] = useConnectedDeviceData<boolean>(
    { keymap: { checkUnsavedChanges: true } },
    (r) => r.keymap?.checkUnsavedChanges,
    true,
  );
  useSub("rpc_notification.keymap.unsavedChangesStatusChanged", setUnsaved);
  const save = () =>
    history.run(async () => {
      const result = (
        await call_rpc(session.conn, { keymap: { saveChanges: true } })
      ).keymap?.saveChanges;
      if (!result?.ok)
        throw Error(
          "Save failed · " +
            (result?.err !== undefined
              ? saveErrors[result.err] ||
                "The keyboard could not store the changes."
              : "no acknowledgement"),
        );
      setUnsaved(false);
      setSavedRevision((n) => n + 1);
    });
  const discard = () =>
    history.run(async () => {
      if (
        !(await call_rpc(session.conn, { keymap: { discardChanges: true } }))
          .keymap?.discardChanges
      )
        throw Error("The keyboard could not discard changes.");
      reload();
    });
  const reset = () =>
    history.run(async () => {
      if (
        !(await call_rpc(session.conn, { core: { resetSettings: true } })).core
          ?.resetSettings
      )
        throw Error("The keyboard could not restore stock settings.");
      reload();
    });
  const disconnect = () =>
    history.run(async () => {
      await session.conn.request_writable.close();
      session.abort.abort();
    });
  return (
    <UndoRedoContext.Provider value={history.doIt}>
      <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
      <LicenseNoticeModal
        open={showLicenseNotice}
        onClose={() => setShowLicenseNotice(false)}
      />
      <main className="studio-shell bg-base-100 text-base-content">
        <AppHeader
          connectedDeviceLabel={session.name}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
          onSave={save}
          onDiscard={discard}
          onDisconnect={disconnect}
          onResetSettings={reset}
          busy={history.busy}
          unsaved={unsaved}
          demo={session.demo}
          saved={savedRevision > 0}
        />
        {history.failure && (
          <div role="alert" className="studio-error">
            {history.failure.message}{" "}
            <button className="studio-button" onClick={history.failure.retry}>
              Retry
            </button>
          </div>
        )}
        <fieldset
          disabled={history.busy}
          className="studio-workspace"
          ref={(el) => {
            if (el) el.inert = history.busy;
          }}
        >
          <Keyboard
            device={session.identity}
            lightingSupport={session.lightingSupport}
            savedRevision={savedRevision}
            failure={history.failure}
          />
        </fieldset>
        <AppFooter
          onShowAbout={() => setShowAbout(true)}
          onShowLicenseNotice={() => setShowLicenseNotice(true)}
        />
      </main>
    </UndoRedoContext.Provider>
  );
}

export default App;
