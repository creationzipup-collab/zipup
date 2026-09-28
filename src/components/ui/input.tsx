import * as React from "react";

import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-[10px] border border-line-2 bg-panel-2/70 px-3 text-sm text-fg outline-none transition-[border,box-shadow,background] placeholder:text-fg-4 hover:border-line-3 focus:border-fg-3 focus:bg-panel-2 focus:shadow-[0_0_0_3px_var(--line)] disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputClass, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean; maxRows?: number }
>(({ className, autoGrow, maxRows = 12, onInput, ...props }, ref) => {
  const inner = React.useRef<HTMLTextAreaElement | null>(null);
  React.useImperativeHandle(ref, () => inner.current!);
  const resize = React.useCallback(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + 24)}px`;
  }, [autoGrow, maxRows]);
  React.useLayoutEffect(resize, [resize, props.value]);
  return (
    <textarea
      ref={inner}
      className={cn(inputClass, "min-h-20 resize-none py-2.5 leading-relaxed", className)}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-fg-2", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-3">{hint}</p>
      ) : null}
    </div>
  );
}
