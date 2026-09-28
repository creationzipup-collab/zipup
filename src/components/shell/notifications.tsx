"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Bell, CircleCheck, CircleX, MessageSquare, UserPlus, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Tip } from "@/components/ui/menu";
import { EmptyState, TimeAgo } from "@/components/ui/misc";
import { cn, fetchJson } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const ICONS: Record<string, React.ElementType> = {
  signup_pending: UserPlus,
  account_approved: CircleCheck,
  generation_completed: CircleCheck,
  generation_failed: CircleX,
  mention: AtSign,
  comment: MessageSquare,
  project_invite: UserPlus,
  budget_warning: Wallet,
  budget_exceeded: Wallet,
};

export function NotificationsButton() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchJson<{ items: Notification[]; unread: number }>("/api/notifications"),
    refetchInterval: 30_000,
  });
  const unread = data?.unread ?? 0;

  async function markAll() {
    await fetchJson("/api/notifications", { method: "POST", body: JSON.stringify({}) });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <Popover>
      <Tip content="알림">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="relative" aria-label="알림">
            <Bell />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex min-w-3.5 items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold leading-[14px] text-[#0a0a0a]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-sm font-semibold">알림</span>
          {unread > 0 && (
            <button onClick={markAll} className="text-xs text-fg-3 hover:text-fg">
              모두 읽음
            </button>
          )}
        </div>
        <div className="max-h-[440px] overflow-y-auto p-1.5 scrollbar-thin">
          {!data?.items.length ? (
            <EmptyState icon={<Bell />} title="새 알림이 없어요" className="py-10" />
          ) : (
            data.items.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={async () => {
                    if (!n.readAt) {
                      await fetchJson("/api/notifications", { method: "POST", body: JSON.stringify({ ids: [n.id] }) });
                      void qc.invalidateQueries({ queryKey: ["notifications"] });
                    }
                    if (n.href) router.push(n.href);
                  }}
                  className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-panel-2"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-line-2 bg-panel-2",
                      n.type.includes("failed") || n.type.includes("exceeded") ? "text-danger" : n.type.includes("budget") ? "text-warning" : "text-fg-2",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13px] leading-snug", !n.readAt ? "font-medium text-fg" : "text-fg-2")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-xs text-fg-3">{n.body}</span>}
                    <TimeAgo date={n.createdAt} className="mt-1 block text-[11px] text-fg-4" />
                  </span>
                  {!n.readAt && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
