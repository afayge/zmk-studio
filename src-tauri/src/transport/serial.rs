use super::commands::AvailableDevice;
use blocking::unblock;
use futures::channel::mpsc::channel;
use futures::StreamExt;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_serial::{available_ports, SerialPortBuilderExt, SerialPortType};

use tauri::{command, AppHandle, State};
use tauri_plugin_cli::CliExt;

const READ_BUF_SIZE: usize = 1024;

#[command]
pub async fn serial_connect(
    id: String,
    app_handle: AppHandle,
    state: State<'_, super::commands::ActiveConnection<'_>>,
) -> Result<bool, String> {
    match tokio_serial::new(id, 9600).open_native_async() {
        Ok(mut port) => {
            #[cfg(unix)]
            port.set_exclusive(false)
                .expect("Unable to set serial port exclusive to false");

            let (mut reader, mut writer) = tokio::io::split(port);

            let (send, mut recv) = channel(5);
            *state.conn.lock().await = Some(Box::new(send));

            let read_process = tauri::async_runtime::spawn(async move {
                use tauri::Emitter;
                use tauri::Manager;

                let mut buffer = vec![0; READ_BUF_SIZE];
                while let Ok(size) = reader.read(&mut buffer).await {
                    if size > 0 {
                        app_handle.emit("connection_data", &buffer[..size]);
                    } else {
                        break;
                    }
                }

                let state = app_handle.state::<super::commands::ActiveConnection>();
                *state.conn.lock().await = None;

                app_handle.emit("connection_disconnected", ());
            });

            tauri::async_runtime::spawn(async move {
                while let Some(data) = recv.next().await {
                    let _res = writer.write(&data).await;
                }

                // Closing the sender already cleared the connection. A retry may
                // have installed its own sender by the time this task exits.
                read_process.abort();
            });

            Ok(true)
        }
        Err(e) => Err(format!("Failed to open the serial port: {}", e.description)),
    }
}

#[command]
pub async fn serial_list_devices(app_handle: AppHandle) -> Result<Vec<AvailableDevice>, String> {
    let ports = unblock(available_ports).await.map_err(|e| e.to_string())?;

    let mut candidates = ports
        .into_iter()
        .filter_map(|pi| {
            if let SerialPortType::UsbPort(u) = pi.port_type {
                Some(AvailableDevice {
                    id: pi.port_name,
                    label: u.product.unwrap_or("Unnamed device".to_string()),
                })
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    match app_handle.cli().matches() {
        Ok(m) => {
            if let Some(p) = m.args.get("serial-port") {
                if let serde_json::Value::String(path) = &p.value {
                    candidates.push(AvailableDevice {
                        id: path.to_string(),
                        label: format!("CLI Port: {path}").to_string(),
                    })
                }
            }
        }
        Err(_) => {}
    }

    #[cfg(target_os = "macos")]
    prefer_callout_ports(&mut candidates);

    Ok(candidates)
}

#[cfg(any(target_os = "macos", test))]
fn prefer_callout_ports(devices: &mut Vec<AvailableDevice>) {
    use std::collections::HashSet;

    let callouts: HashSet<String> = devices
        .iter()
        .filter_map(|d| d.id.strip_prefix("/dev/cu.").map(str::to_owned))
        .collect();
    let mut seen = HashSet::new();
    devices.retain(|d| {
        if let Some(port) = d.id.strip_prefix("/dev/tty.") {
            if callouts.contains(port) {
                return false;
            }
        }
        seen.insert(d.id.clone())
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_callout_for_each_port_and_keeps_unpaired_paths() {
        let mut ports: Vec<_> = [
            "/dev/tty.usb1",
            "/dev/cu.usb2",
            "/dev/tty.only",
            "/dev/cu.usb1",
            "/dev/tty.usb2",
            "/dev/cu.usb1",
            "/tmp/custom",
        ]
        .iter()
        .map(|id| AvailableDevice {
            id: id.to_string(),
            label: "CORNE54V3".into(),
        })
        .collect();
        prefer_callout_ports(&mut ports);
        let paths: Vec<_> = ports.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(
            paths,
            [
                "/dev/cu.usb2",
                "/dev/tty.only",
                "/dev/cu.usb1",
                "/tmp/custom"
            ]
        );
    }
}
