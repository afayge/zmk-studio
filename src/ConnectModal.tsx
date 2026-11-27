import { useEffect, useState } from "react";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import type { AvailableDevice } from "./tauri/index";
import { RefreshCw } from "lucide-react";
import { ListBox, ListBoxItem } from "react-aria-components";
import { useModalRef } from "./misc/useModalRef";
import { ExternalLink } from "./misc/ExternalLink";
import { GenericModal } from "./GenericModal";

export type TransportKind = "USB" | "BLE";
type DevicePicker = {
  list: () => Promise<AvailableDevice[]>;
  connect: (dev: AvailableDevice) => Promise<RpcTransport>;
};
export type TransportFactory =
  | { label: TransportKind; connect: () => Promise<RpcTransport> }
  | { label: TransportKind; pick_and_connect: DevicePicker };

export interface ConnectModalProps {
  open?: boolean;
  onDemo?: () => void;
  busy?: boolean;
  error?: string;
  transports: TransportFactory[];
  onConnect: (
    kind: TransportKind,
    connect: () => Promise<RpcTransport>,
  ) => void;
}

type DeviceEntry = AvailableDevice & {
  kind: TransportKind;
  connect: () => Promise<RpcTransport>;
};

function DeviceList({
  transports,
  onConnect,
  busy,
}: Pick<ConnectModalProps, "transports" | "onConnect" | "busy">) {
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setRefreshing(true);
      setDevices([]);
      setListError("");
      const entries: DeviceEntry[] = [];
      const errors: string[] = [];
      for (const t of transports) {
        if (!("pick_and_connect" in t)) continue;
        try {
          const devices = await t.pick_and_connect.list();
          if (!active) return;
          for (const device of devices) {
            entries.push({
              ...device,
              kind: t.label,
              connect: () => t.pick_and_connect.connect(device),
            });
          }
        } catch (error) {
          errors.push(`${t.label}: ${String(error)}`);
        }
      }
      if (active) {
        setDevices(entries);
        setListError(errors.join(" · "));
        setRefreshing(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [transports, refresh]);

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto]">
        <label>Select A Device:</label>
        <button
          aria-label="Refresh devices"
          className="p-1 rounded hover:bg-base-300 disabled:bg-base-100 disabled:opacity-75"
          disabled={refreshing || busy}
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw className={`size-5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      <ListBox
        aria-label="Device"
        items={devices}
        className="flex flex-col gap-1 pt-1"
        selectionMode="single"
        selectedKeys={[]}
        onSelectionChange={(keys) => {
          if (busy || keys === "all") return;
          const device = devices.find((d) => keys.has(`${d.kind}:${d.id}`));
          if (device) onConnect(device.kind, device.connect);
        }}
      >
        {(d) => (
          <ListBoxItem
            id={`${d.kind}:${d.id}`}
            isDisabled={busy}
            textValue={d.label}
            aria-label={`${d.label} (${d.kind})`}
            className="flex items-center gap-2 rounded hover:bg-base-300 cursor-pointer px-1"
          >
            <span>{d.label}</span>
            <small>{d.kind}</small>
          </ListBoxItem>
        )}
      </ListBox>
      {listError && <p role="alert">{listError}</p>}
    </div>
  );
}

function noTransportsOptionsPrompt() {
  return (
    <div className="m-4 flex flex-col gap-2">
      <p>
        Your browser is not supported. ZMK Studio uses either{" "}
        <ExternalLink href="https://caniuse.com/web-serial">
          Web Serial
        </ExternalLink>{" "}
        or{" "}
        <ExternalLink href="https://caniuse.com/web-bluetooth">
          Web Bluetooth
        </ExternalLink>{" "}
        (Linux only) to connect to ZMK devices.
      </p>

      <div>
        <p>To use ZMK Studio, either:</p>
        <ul className="list-disc list-inside">
          <li>
            Use a browser that supports the above web technologies, e.g.
            Chrome/Edge, or
          </li>
          <li>
            Download our{" "}
            <ExternalLink href="https://github.com/afayge/zmk-studio/releases">
              cross platform application
            </ExternalLink>
            .
          </li>
        </ul>
      </div>
    </div>
  );
}

export const ConnectModal = ({
  open,
  transports,
  onDemo,
  busy,
  error,
  onConnect,
}: ConnectModalProps) => {
  const dialog = useModalRef(open || false, false, false);
  const nativePicker = transports.some((t) => "pick_and_connect" in t);

  return (
    <GenericModal ref={dialog} className="max-w-xl">
      <h1 className="text-xl">Welcome to ZMK Studio</h1>
      <fieldset disabled={busy}>
        {open &&
          (nativePicker ? (
            <DeviceList
              transports={transports}
              onConnect={onConnect}
              busy={busy}
            />
          ) : transports.length ? (
            <>
              <p className="text-sm">Select a connection type.</p>
              <div className="flex gap-2 pt-2">
                {transports.map(
                  (t) =>
                    "connect" in t && (
                      <button
                        key={t.label}
                        type="button"
                        className="bg-base-300 hover:bg-primary hover:text-primary-content rounded px-2 py-1"
                        onClick={() => onConnect(t.label, t.connect)}
                      >
                        {t.label}
                      </button>
                    ),
                )}
              </div>
            </>
          ) : (
            noTransportsOptionsPrompt()
          ))}
        {onDemo && (
          <button className="studio-button mt-3" onClick={onDemo}>
            Try a demo keyboard
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </GenericModal>
  );
};
