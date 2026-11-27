import { TooltipTrigger, Tooltip as AriaTooltip } from "react-aria-components";

export interface TooltipProps {
  children: React.ReactNode;
  label: string;
  delay?: number;
}

export const Tooltip = ({ children, label, delay = 1000 }: TooltipProps) => {
  return (
    <TooltipTrigger delay={delay} closeDelay={500}>
      {children}
      <AriaTooltip
        offset={5}
        className="max-w-[min(24rem,90vw)] break-words z-50 bg-base-200 text-base-content px-2 py-1 rounded shadow-md"
      >
        {label}
      </AriaTooltip>
    </TooltipTrigger>
  );
};
