import { rendererNames } from "./lightingEditor";
import { demoLightingEditor } from "./demoLightingEditor";
import type { Catalog, Request, Response, State } from "./generated/lighting";

export const demoHueCount = 36;

export function demoLighting(): (request: Request) => Response {
  const catalog: Catalog = {
    editorVersion: 3,
    peripheralSlots: 1,
    profiles: rendererNames.map((renderer, id) => ({
      id,
      name: ["Palette", "Breathing palette"][id] ?? renderer,
      renderer: renderer.toLowerCase(),
    })),
    zones: [
      {
        id: 0,
        name: "Accent LEDs",
        profiles: [
          { id: 0, name: "Off", renderer: "solid" },
          { id: 1, name: "Glow", renderer: "breathe" },
        ],
      },
    ],
    persistent: false,
    maxSpeed: 5,
    hueCount: demoHueCount,
  };
  const state: State = {
    enabled: true,
    brightness: 70,
    speed: 3,
    hue: 0,
    profile: 0,
    zoneProfiles: Uint8Array.of(0),
  };
  const editor = demoLightingEditor(catalog, state);
  let lastBrightness = state.brightness;
  return (request) => {
    if (request.exchange) return { exchange: editor(request.exchange) };
    if (request.getCatalog) return { catalog };
    if (request.getState) return { state };
    const s = request.set;
    if (!s) return { rejected: true };
    if (s.enabled !== undefined) {
      state.enabled = s.enabled;
      state.brightness = s.enabled ? Math.max(lastBrightness, 5) : 0;
      if (s.enabled) lastBrightness = state.brightness;
    } else if (
      s.brightness !== undefined &&
      s.brightness >= 0 &&
      s.brightness <= 100
    ) {
      state.brightness = s.brightness;
      state.enabled = s.brightness > 0;
      if (state.enabled) lastBrightness = s.brightness;
    } else if (
      s.speed !== undefined &&
      s.speed >= 1 &&
      s.speed <= catalog.maxSpeed
    )
      state.speed = s.speed;
    else if (
      s.hue !== undefined &&
      Number.isInteger(s.hue) &&
      s.hue >= 0 &&
      s.hue < catalog.hueCount
    )
      state.hue = s.hue;
    else if (
      s.profile !== undefined &&
      catalog.profiles.some((p) => p.id === s.profile)
    )
      state.profile = s.profile;
    else if (s.zoneProfile) {
      const { zone, profile } = s.zoneProfile;
      if (
        !catalog.zones
          .find((z) => z.id === zone)
          ?.profiles.some((p) => p.id === profile)
      )
        return { rejected: true };
      state.zoneProfiles[zone] = profile;
    } else return { rejected: true };
    return { state };
  };
}
