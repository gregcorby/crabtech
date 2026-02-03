"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  id?: string;
}

export function Select({
  label,
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  error,
  id,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const selectId = id || label.toLowerCase().replace(/\s+/g, "-");

  const selectedOption = options.find((o) => o.value === value);

  const close = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [close]);

  useEffect(() => {
    if (open && focusedIndex >= 0 && listboxRef.current) {
      const items = listboxRef.current.querySelectorAll('[role="option"]');
      (items[focusedIndex] as HTMLElement)?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex, open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (open && focusedIndex >= 0) {
          onChange(options[focusedIndex].value);
          close();
        } else {
          setOpen(true);
          setFocusedIndex(options.findIndex((o) => o.value === value));
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setFocusedIndex(options.findIndex((o) => o.value === value));
        } else {
          setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) {
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label
        id={`${selectId}-label`}
        className="block text-sm font-medium text-neutral-700"
      >
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby={`${selectId}-label`}
          aria-controls={open ? `${selectId}-listbox` : undefined}
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-sm text-left",
            "transition-all duration-200",
            "hover:border-neutral-400",
            "focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none",
            "disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed",
            error
              ? "border-error-500 focus:border-error-500 focus:ring-error-500/20"
              : "border-neutral-300",
            open && !error && "border-primary-500 ring-2 ring-primary-500/20",
          )}
        >
          <span className={cn(!selectedOption && "text-neutral-400")}>
            {selectedOption?.label ?? placeholder}
          </span>
          <svg
            className={cn("h-4 w-4 text-neutral-400 transition-transform duration-200", open && "rotate-180")}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {open && (
          <ul
            id={`${selectId}-listbox`}
            ref={listboxRef}
            role="listbox"
            aria-labelledby={`${selectId}-label`}
            className={cn(
              "absolute z-dropdown mt-1 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-elevated",
              "animate-fade-in max-h-60",
            )}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm transition-colors",
                  option.value === value
                    ? "bg-primary-50 text-primary-700 font-medium"
                    : "text-neutral-700",
                  focusedIndex === index && "bg-neutral-100",
                  "hover:bg-neutral-100",
                )}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                onMouseEnter={() => setFocusedIndex(index)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-error-600" role="alert">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
