import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";

import {
  BugReportForm,
  DEFAULT_BUG_REPORT_COPY,
  createBugReportCssVariables,
  type BugReportCssProperties,
  type BugReportFormProps,
} from "./bug-report-form.js";
import { BugIcon, CloseIcon } from "./icons.js";

export interface BugReportDialogProps extends BugReportFormProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  closeLabel?: string;
  dialogClassName?: string;
}

export function BugReportDialog({
  open,
  onOpenChange,
  closeLabel = "Close bug report",
  dialogClassName,
  copy,
  theme = "light",
  colors,
  accentColor,
  primaryColor,
  fontFamily,
  monoFontFamily,
  ...formProps
}: BugReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerDownTarget = useRef<EventTarget | null>(null);
  const pointerUpTarget = useRef<EventTarget | null>(null);
  const title = copy?.title ?? DEFAULT_BUG_REPORT_COPY.title;
  const dialogStyle = createBugReportCssVariables(
    colors,
    accentColor,
    primaryColor,
    fontFamily,
    monoFontFamily,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const clickBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    const pressedOnBackdrop =
      pointerDownTarget.current === event.currentTarget;
    const releasedOnBackdrop =
      pointerUpTarget.current === event.currentTarget;
    const clickedOnBackdrop = event.target === event.currentTarget;
    pointerDownTarget.current = null;
    pointerUpTarget.current = null;
    if (pressedOnBackdrop && releasedOnBackdrop && clickedOnBackdrop) {
      onOpenChange(false);
    }
  };

  return (
    <dialog
      aria-label={title}
      className={["nbr-dialog", dialogClassName].filter(Boolean).join(" ")}
      data-bug-report-exclude=""
      data-theme={theme}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={clickBackdrop}
      onPointerDown={(event: PointerEvent<HTMLDialogElement>) => {
        pointerDownTarget.current = event.target;
        pointerUpTarget.current = null;
      }}
      onPointerUp={(event: PointerEvent<HTMLDialogElement>) => {
        pointerUpTarget.current = event.target;
      }}
      onPointerCancel={() => {
        pointerDownTarget.current = null;
        pointerUpTarget.current = null;
      }}
      ref={dialogRef}
      style={dialogStyle}
    >
      {open ? (
        <div className="nbr-dialog__panel">
          <button
            aria-label={closeLabel}
            className="nbr-dialog__close"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <CloseIcon height="18" width="18" />
          </button>
          <BugReportForm
            theme={theme}
            {...(copy ? { copy } : {})}
            {...(colors ? { colors } : {})}
            {...(accentColor ? { accentColor } : {})}
            {...(primaryColor ? { primaryColor } : {})}
            {...(fontFamily ? { fontFamily } : {})}
            {...(monoFontFamily ? { monoFontFamily } : {})}
            {...formProps}
          />
        </div>
      ) : null}
    </dialog>
  );
}

export type BugReportWidgetPosition =
  "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface BugReportWidgetProps extends Omit<
  BugReportDialogProps,
  "open" | "onOpenChange"
> {
  defaultOpen?: boolean;
  onOpenChange?(open: boolean): void;
  triggerLabel?: string;
  position?: BugReportWidgetPosition;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
}

export function BugReportWidget({
  defaultOpen = false,
  onOpenChange,
  triggerLabel = "Report a bug",
  position = "bottom-right",
  triggerClassName,
  triggerStyle,
  theme = "light",
  accentColor,
  primaryColor,
  fontFamily,
  monoFontFamily,
  colors,
  ...dialogProps
}: BugReportWidgetProps) {
  const [open, setOpen] = useState(defaultOpen);
  const updateOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const colorVariables: BugReportCssProperties = {
    ...createBugReportCssVariables(
      colors,
      accentColor,
      primaryColor,
      fontFamily,
      monoFontFamily,
    ),
    ...triggerStyle,
  };

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        className={["nbr-widget-trigger", triggerClassName]
          .filter(Boolean)
          .join(" ")}
        data-bug-report-exclude=""
        data-position={position}
        data-theme={theme}
        onClick={() => updateOpen(true)}
        style={colorVariables}
        type="button"
      >
        <BugIcon height="18" width="18" />
        <span>{triggerLabel}</span>
      </button>
      <BugReportDialog
        onOpenChange={updateOpen}
        open={open}
        theme={theme}
        {...(accentColor ? { accentColor } : {})}
        {...(primaryColor ? { primaryColor } : {})}
        {...(fontFamily ? { fontFamily } : {})}
        {...(monoFontFamily ? { monoFontFamily } : {})}
        {...(colors ? { colors } : {})}
        {...dialogProps}
      />
    </>
  );
}
