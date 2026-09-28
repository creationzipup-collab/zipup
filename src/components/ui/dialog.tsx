"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  size = "md",
  hideClose,
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, "title"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  hideClose?: boolean;
}) {
  const width = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[min(1400px,96vw)]",
  }[size];
  return (
    <D.Portal>
      <D.Overlay className="zi-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          "zi-dialog fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line-2 bg-elevated shadow-[var(--shadow-pop)] outline-none",
          width,
          className,
        )}
        {...props}
      >
        {(title || description) && (
          <div className="flex flex-col gap-1 border-b border-line px-5 pb-4 pt-5">
            {title && <D.Title className="text-[17px] font-semibold tracking-tight">{title}</D.Title>}
            {description ? (
              <D.Description className="text-sm text-fg-3">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : "대화상자"}</D.Description>
            )}
          </div>
        )}
        {!title && <D.Title className="sr-only">대화상자</D.Title>}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
        {!hideClose && (
          <D.Close className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-fg-3 transition hover:bg-panel-2 hover:text-fg">
            <X className="size-4" />
            <span className="sr-only">닫기</span>
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 border-t border-line bg-panel/50 px-5 py-3.5", className)}
      {...props}
    />
  );
}

/** 오른쪽에서 나오는 패널 */
export function SheetContent({
  className,
  children,
  title,
  side = "right",
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, "title"> & { title?: React.ReactNode; side?: "right" | "left" }) {
  return (
    <D.Portal>
      <D.Overlay className="zi-overlay fixed inset-0 z-50 bg-overlay" />
      <D.Content
        className={cn(
          "zi-sheet fixed top-0 z-50 flex h-full w-[min(440px,100vw)] flex-col border-line-2 bg-elevated shadow-[var(--shadow-pop)] outline-none",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <D.Title className="text-[15px] font-semibold">{title}</D.Title>
          <D.Description className="sr-only">패널</D.Description>
          <D.Close className="rounded-lg p-1.5 text-fg-3 hover:bg-panel-2 hover:text-fg">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
