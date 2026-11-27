#!/usr/bin/env bash
# Run from the repository root on the native build runner.
set -eu
shopt -s nullglob
version=$(node -p "require('./src-tauri/tauri.conf.json').version")
target=${CARGO_TARGET_DIR:-src-tauri/target}
output=${RELEASE_ASSET_DIR:-release-assets}
mkdir -p "$output"
prefix="$output/ZMK-Studio-$PLATFORM"
single_file() {
  if [[ $# != 1 || ! -f "$1" ]]; then
    echo "Expected one matching package; found $#" >&2
    return 1
  fi
  printf '%s\n' "$1"
}

case "$PLATFORM" in
  macOS-universal)
    dmg=$(single_file "$target"/universal-apple-darwin/release/bundle/dmg/*_"$version"_*.dmg)
    hdiutil verify "$dmg"
    mount=$(mktemp -d)
    hdiutil attach -readonly -nobrowse -mountpoint "$mount" "$dmg"
    trap 'hdiutil detach "$mount"; rmdir "$mount"' EXIT
    app="$mount/ZMK Studio.app"
    lipo -verify_arch arm64 x86_64 "$app/Contents/MacOS/zmk-studio"
    test "$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")" = "$version"
    codesign --verify --deep --strict "$app"
    cp "$dmg" "$prefix.dmg"
    ;;
  Windows-x64)
    exe=$(single_file "$target"/release/bundle/nsis/*_"$version"_x64-setup.exe)
    file "$exe" | grep -F 'PE32'
    file "$target/release/zmk-studio.exe" | grep -F 'x86-64'
    cp "$exe" "$prefix-setup.exe"
    ;;
  Linux-x64|Linux-arm64)
    case "$PLATFORM" in
      Linux-x64) arch=amd64; machine='X86-64' ;;
      Linux-arm64) arch=arm64; machine='AArch64' ;;
    esac
    deb=$(single_file "$target"/release/bundle/deb/*_"$version"_"$arch".deb)
    image=$(single_file "$target"/release/bundle/appimage/*_"$version"_*.AppImage)
    test "$(dpkg-deb -f "$deb" Architecture)" = "$arch"
    test "$(dpkg-deb -f "$deb" Version)" = "$version"
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    dpkg-deb -x "$deb" "$tmp/deb"
    image_abs=$(realpath "$image")
    (cd "$tmp" && "$image_abs" --appimage-extract >/dev/null)
    for bin in "$tmp/deb/usr/bin/zmk-studio" "$tmp/squashfs-root/usr/bin/zmk-studio"; do
      readelf -h "$bin" | grep 'Machine:' | grep -iF "$machine"
    done
    cp "$image" "$prefix.AppImage"
    cp "$deb" "$prefix.deb"
    ;;
  *) echo "Unknown package platform $PLATFORM" >&2; exit 1 ;;
esac
