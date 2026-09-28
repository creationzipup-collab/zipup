"use client";

import { Check, ChevronRight } from "lucide-react";
import { DropdownMenu as M, Popover as P, Tooltip as T } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/* -------------------------------- Dropdown -------------------------------- */

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuGroup = M.Group;
export const MenuSub = M.Sub;

const menuPanel =
  "z-50 min-w-[190px] overflow-hidden rounded-xl border border-line-2 bg-elevated/95 p-1 text-sm shadow-[var(--shadow-pop)] backdrop-blur-xl";

export function MenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={sideOffset} className={cn(menuPanel, className)} {...props} />
    </M.Portal>
  );
}

const itemClass =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-lg px-2 text-[13px] text-fg-2 outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-panel-3 data-[highlighted]:text-fg data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0";

export function MenuItem({
  className,
  danger,
  shortcut,
  children,
  ...props
}: React.ComponentProps<typeof M.Item> & { danger?: boolean; shortcut?: string }) {
  return (
    <M.Item className={cn(itemClass, danger && "text-danger data-[highlighted]:text-danger", className)} {...props}>
      {children}
      {shortcut && <span className="ml-auto pl-4 font-mono text-[10.5px] text-fg-4">{shortcut}</span>}
    </M.Item>
  );
}

export function MenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn(itemClass, "pl-7", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <M.ItemIndicator>
          <Check className="size-3.5" />
        </M.ItemIndicator>
      </span>
      {children}
    </M.CheckboxItem>
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 pb-1 pt-2 text-[11px] font-medium text-fg-4", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export function MenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof M.SubTrigger>) {
  return (
    <M.SubTrigger className={cn(itemClass, "data-[state=open]:bg-panel-3", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto size-3.5" />
    </M.SubTrigger>
  );
}

export function MenuSubContent({ className, ...props }: React.ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent className={cn(menuPanel, className)} sideOffset={6} {...props} />
    </M.Portal>
  );
}

/* --------------------------------- Popover -------------------------------- */

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({ className, sideOffset = 8, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-2xl border border-line-2 bg-elevated/95 p-3 text-sm shadow-[var(--shadow-pop)] outline-none backdrop-blur-xl",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

/* --------------------------------- Tooltip -------------------------------- */

export const TooltipProvider = T.Provider;

export function Tip({
  content,
  children,
  side = "top",
  shortcut,
  delay,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  shortcut?: string;
  delay?: number;
}) {
  if (!content) return <>{children}</>;
  return (
    <T.Root delayDuration={delay ?? 250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] flex items-center gap-2 rounded-lg border border-line-2 bg-elevated px-2 py-1 text-xs text-fg shadow-[var(--shadow-soft)]"
        >
          {content}
          {shortcut && <kbd className="font-mono text-[10px] text-fg-3">{shortcut}</kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
