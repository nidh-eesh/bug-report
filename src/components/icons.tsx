import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const common: SVGProps<SVGSVGElement> = {
  "aria-hidden": true,
  fill: "none",
  focusable: false,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export function IncognitoIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="M5.5 11 7.6 5.8A1.2 1.2 0 0 1 8.8 5h6.4a1.2 1.2 0 0 1 1.2.8l2.1 5.2" />
      <path d="M3.2 11.6h17.6" />
      <circle cx="7.6" cy="16.2" r="2.7" />
      <circle cx="16.4" cy="16.2" r="2.7" />
      <path d="M10.3 16.2q1.7-1.1 3.4 0" />
    </svg>
  );
}

export function BugIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="M8.2 8.1a4.8 4.8 0 0 1 7.6 0" />
      <rect x="6.5" y="7.5" width="11" height="11" rx="5.5" />
      <path d="M12 8v10.5M3.5 10.5h3M17.5 10.5h3M3.5 15.5h3M17.5 15.5h3M8.2 5 6.7 3.5M15.8 5l1.5-1.5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function PaperclipIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="m20.5 11.5-8.2 8.2a5.5 5.5 0 0 1-7.8-7.8l8.7-8.7a3.8 3.8 0 0 1 5.4 5.4l-8.7 8.7a2.1 2.1 0 0 1-3-3l8.2-8.2" />
    </svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="M4 8.5h3l1.5-2h7l1.5 2h3v10H4z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="m5 12.5 4.3 4.2L19 7" />
    </svg>
  );
}

export function ChevronIcon({
  direction = "down",
  ...props
}: IconProps & { direction?: "down" | "up" }) {
  return (
    <svg {...common} {...props}>
      <path d={direction === "down" ? "m7 9.5 5 5 5-5" : "m7 14.5 5-5 5 5"} />
    </svg>
  );
}
