import { BehaviorParameterValueDescription } from "../rpc/generated/behaviors";
import { hid_usage_page_and_id_from_usage } from "../hid-usages";

export function validateValue(
  layerIds: number[],
  value?: number,
  values?: BehaviorParameterValueDescription[],
): boolean {
  if (value === undefined) {
    return values === undefined || values?.length === 0 || !!values[0].nil;
  }

  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return false;
  const matchingValue = values?.find((v) => {
    if (v.constant !== undefined) {
      return v.constant == value;
    } else if (v.range) {
      return value >= v.range.min && value <= v.range.max;
    } else if (v.signedAxes) {
      return true;
    } else if (v.hsb) {
      return (
        value >>> 16 <= 360 &&
        ((value >>> 8) & 255) <= 100 &&
        (value & 255) <= 100
      );
    } else if (v.hidUsage) {
      const [page, id] = hid_usage_page_and_id_from_usage(value);
      const usagePage = page & 0xff;
      if (usagePage === 7)
        return (
          (id >= 1 && id <= v.hidUsage.keyboardMax) ||
          (id >= 0xe0 && id <= 0xe7)
        );
      return usagePage === 12 && id <= v.hidUsage.consumerMax;
    } else if (v.layerId) {
      return layerIds.includes(value);
    } else if (v.nil) {
      return value === 0;
    } else {
      console.error("Unknown check type!");
      return false;
    }
  });

  return !!matchingValue || (value === 0 && (!values || values.length === 0));
}
