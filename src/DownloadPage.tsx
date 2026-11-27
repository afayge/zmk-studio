import { DownloadIcon } from "lucide-react";

const releases = "https://github.com/afayge/zmk-studio/releases";
const downloads = [
  ["macOS · Apple Silicon / Intel", "ZMK-Studio-macOS-universal.dmg"],
  ["Windows · x64", "ZMK-Studio-Windows-x64-setup.exe"],
  ["Linux · x64 · AppImage", "ZMK-Studio-Linux-x64.AppImage"],
  ["Linux · x64 · DEB", "ZMK-Studio-Linux-x64.deb"],
  ["Linux · ARM64 · AppImage", "ZMK-Studio-Linux-arm64.AppImage"],
  ["Linux · ARM64 · DEB", "ZMK-Studio-Linux-arm64.deb"],
];

export function Download() {
  return (
    <main className="bg-base-200 text-base-content min-h-screen grid place-content-center p-6">
      <h1 className="text-3xl font-semibold">ZMK Studio · afayge</h1>
      <ul className="my-6 flex flex-col gap-3">
        {downloads.map(([label, file]) => (
          <li key={file}>
            <a className="flex items-center gap-2 hover:underline" href={`${releases}/latest/download/${file}`}>
              <DownloadIcon size={18} aria-hidden="true" /> {label}
            </a>
          </li>
        ))}
      </ul>
      <a href={releases} className="underline">Release notes and SHA-256 checksums</a>
    </main>
  );
}
