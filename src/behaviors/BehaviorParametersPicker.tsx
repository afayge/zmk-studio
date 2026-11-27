import { BehaviorBindingParametersSet } from "../rpc/generated/behaviors";
import { ParameterValuePicker } from "./ParameterValuePicker";
import { validateValue } from "./parameters";

export interface BehaviorParametersPickerProps {
  param1?: number;
  param2?: number;
  metadata: BehaviorBindingParametersSet[];
  layers: { id: number; name: string }[];
  onParam1Changed: (value?: number) => void;
  onParam2Changed: (value?: number) => void;
}

export const BehaviorParametersPicker = ({
  param1,
  param2,
  metadata,
  layers,
  onParam1Changed,
  onParam2Changed,
}: BehaviorParametersPickerProps) => {
  if (param1 === undefined) {
    return (
      <div>
        <ParameterValuePicker
          values={metadata.flatMap((m) => m.param1)}
          onValueChanged={onParam1Changed}
          layers={layers}
        />
      </div>
    );
  } else {
    const matching = metadata.filter((s) =>
      validateValue(
        layers.map((l) => l.id),
        param1,
        s.param1,
      ),
    );
    const second = matching.flatMap((s) => s.param2);
    return (
      <>
        <ParameterValuePicker
          values={metadata.flatMap((m) => m.param1)}
          value={param1}
          layers={layers}
          onValueChanged={onParam1Changed}
        />
        {second.length > 0 && (
          <ParameterValuePicker
            key={second.map((v) => v.name + Object.keys(v).join()).join("/")}
            values={second}
            value={param2}
            layers={layers}
            onValueChanged={onParam2Changed}
          />
        )}
      </>
    );
  }
};
