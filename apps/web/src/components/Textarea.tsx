"use client";

import { forwardRef, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  helperText?: string;
  autoResize?: boolean;
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, autoResize = false, showCount = false, id, className, maxLength, ...props }, ref) => {
    const textareaId = id || label.toLowerCase().replace(/\s+/g, "-");
    const internalRef = useRef<HTMLTextAreaElement | null>(null);

    const setRefs = (el: HTMLTextAreaElement | null) => {
      internalRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    };

    useEffect(() => {
      if (autoResize && internalRef.current) {
        const el = internalRef.current;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    }, [props.value, autoResize]);

    const currentLength = typeof props.value === "string" ? props.value.length : 0;

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-neutral-700"
          >
            {label}
          </label>
          {showCount && maxLength && (
            <span
              className={cn(
                "text-xs tabular-nums",
                currentLength > maxLength * 0.9 ? "text-warning-600" : "text-neutral-400",
              )}
            >
              {currentLength.toLocaleString()}/{maxLength.toLocaleString()}
            </span>
          )}
        </div>
        <textarea
          ref={setRefs}
          id={textareaId}
          maxLength={maxLength}
          className={cn(
            "block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-neutral-900",
            "placeholder:text-neutral-400",
            "transition-all duration-200",
            "hover:border-neutral-400",
            "focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none",
            "disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed",
            autoResize && "resize-none overflow-hidden",
            error
              ? "border-error-500 hover:border-error-600 focus:border-error-500 focus:ring-error-500/20"
              : "border-neutral-300",
            className,
          )}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="flex items-center gap-1.5 text-sm text-error-600" role="alert">
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
        {helperText && !error && (
          <p id={`${textareaId}-helper`} className="text-sm text-neutral-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
