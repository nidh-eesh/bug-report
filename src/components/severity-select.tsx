import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import type { BugReportSeverity } from "../core.js";
import { CheckIcon, ChevronIcon } from "./icons.js";

export const DEFAULT_SEVERITY_OPTIONS: readonly {
  value: BugReportSeverity;
  label: string;
}[] = [
  { value: "annoying", label: "A little annoying" },
  { value: "workaround", label: "I found a workaround" },
  { value: "blocking", label: "It's blocking me" },
  { value: "data", label: "Something looks lost or wrong" },
];

export interface SeveritySelectProps {
  value: BugReportSeverity;
  onChange(value: BugReportSeverity): void;
  label: string;
  options?: typeof DEFAULT_SEVERITY_OPTIONS;
  disabled?: boolean;
}

export function SeveritySelect({
  value,
  onChange,
  label,
  options = DEFAULT_SEVERITY_OPTIONS,
  disabled = false,
}: SeveritySelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const labelId = useId();
  const selected =
    options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      openAt(
        Math.max(
          0,
          options.findIndex((option) => option.value === value),
        ),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(options.length - 1);
    }
  };

  const onOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index - 1 + options.length) % options.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(index);
    } else if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      if (event.key === "Escape") {
        event.preventDefault();
        buttonRef.current?.focus();
      }
    }
  };

  return (
    <div className="nbr-severity" ref={rootRef}>
      <span className="nbr-label" id={labelId}>
        {label}
      </span>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={labelId}
        className="nbr-severity__trigger"
        disabled={disabled}
        onClick={() => {
          if (open) setOpen(false);
          else
            openAt(
              Math.max(
                0,
                options.findIndex((option) => option.value === value),
              ),
            );
        }}
        onKeyDown={onTriggerKeyDown}
        ref={buttonRef}
        role="combobox"
        type="button"
      >
        <span>{selected?.label}</span>
        <ChevronIcon direction={open ? "up" : "down"} height="14" width="14" />
      </button>
      {open ? (
        <div
          aria-labelledby={labelId}
          className="nbr-severity__menu"
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className="nbr-severity__option"
              key={option.value}
              onClick={() => choose(index)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="option"
              tabIndex={index === activeIndex ? 0 : -1}
              type="button"
            >
              <span>{option.label}</span>
              {option.value === value ? (
                <CheckIcon height="14" width="14" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
