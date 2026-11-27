import { Field, type Group, type lightingEditor } from "../rpc/lightingEditor";

type Live = Awaited<ReturnType<ReturnType<typeof lightingEditor>["live"]>>;
export type StatusColor = { value?: number; index: number };
export const indicatorMask = (id: number) => 1 << Math.min(id, 3);

// The firmware paints battery, USB, Bluetooth and then each HID lock in ID order.
export function statusColors(live: Live, groups: Map<number, Group>) {
  const colors = new Map<number, StatusColor>();
  for (let id = 0; id < 8; id++) {
    const group = groups.get(id);
    if (!group || !(live.mask & indicatorMask(id))) continue;
    group.leds.forEach((led, member) => {
      let index = member;
      let field: Field = Field.Primary;
      if (!(live.reported & indicatorMask(id))) {
        colors.set(led, { index });
        return;
      }
      if (id === 0) {
        const buckets = group.values[Field.Tertiary];
        const lit = Math.ceil((live.battery * group.leds.length) / 100);
        if (index >= lit) field = Field.Secondary;
        else if (Array.isArray(buckets) && buckets.length) {
          field = Field.Tertiary;
          index = Math.min(
            buckets.length - 1,
            Math.floor((live.battery * buckets.length) / 101),
          );
        }
      } else if (id === 1 || id === 2) {
        const state = id === 1 ? live.usb : live.ble;
        field = [Field.Tertiary, Field.Secondary, Field.Primary][state];
        if (id === 2 && member !== live.bleProfile) {
          colors.set(led, { index, value: 0 });
          return;
        }
        // The snapshot doesn't distinguish a held pairing color from transient blinking.
        if (id === 2 && state === 2) {
          colors.set(led, { index });
          return;
        }
      } else {
        const bit = [1, 0, 2, 3, 4][id - 3];
        field = live.locks & (1 << bit) ? Field.Primary : Field.Secondary;
      }
      const values = group.values[field];
      colors.set(led, {
        index,
        value: Array.isArray(values)
          ? values[values.length === 1 ? 0 : index] ?? 0
          : undefined,
      });
    });
  }
  return colors;
}
