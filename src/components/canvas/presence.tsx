"use client";

import { ViewportPortal } from "@xyflow/react";
import * as React from "react";

import { Tip } from "@/components/ui/menu";
import { cn, fetchJson } from "@/lib/utils";

import type { LaserStroke, Stroke } from "./sketch";

/**
 * 같은 캔버스를 보는 사람들: 커서·스케치·레이저를 실시간으로 공유 (Supabase Realtime).
 * 설정이 없으면(로컬 개발 등) 조용히 꺼져요. 혼자일 때는 메시지를 보내지 않아요.
 */
export type Peer = { id: string; name: string; color: string; cursor: { x: number; y: number } | null; tool?: string };

type Handlers = {
  onStroke: (s: Stroke, final: boolean) => void;
  onLaser: (l: LaserStroke) => void;
  onErase: (ids: string[]) => void;
  onClear: () => void;
};

const PEER_COLORS = ["#1ea7ff", "#a48bff", "#3ddc97", "#f5b83d", "#ff7ca8", "#7cf7ff", "#ff8a5c"];

export function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

type Channel = {
  send: (m: { type: "broadcast"; event: string; payload: unknown }) => Promise<unknown>;
  track: (s: Record<string, unknown>) => Promise<unknown>;
  presenceState: () => Record<string, { name?: string; color?: string }[]>;
  unsubscribe: () => Promise<unknown>;
};

export function usePresence(canvasId: string, me: { id: string; name: string }, handlers: Handlers) {
  const [peers, setPeers] = React.useState<Peer[]>([]);
  const [status, setStatus] = React.useState<"off" | "connecting" | "live">("connecting");
  const channelRef = React.useRef<Channel | null>(null);
  const handlersRef = React.useRef(handlers);
  const peersRef = React.useRef(peers);
  React.useLayoutEffect(() => {
    handlersRef.current = handlers;
    peersRef.current = peers;
  });

  React.useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const cfg = await fetchJson<{ url: string | null; key: string | null }>("/api/realtime").catch(() => null);
      if (!cfg?.url || !cfg.key || cancelled) {
        if (!cancelled) setStatus("off");
        return;
      }
      const { createClient } = await import("@supabase/supabase-js");
      if (cancelled) return;
      const client = createClient(cfg.url!, cfg.key!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 40 } } });
      const channel = client.channel(`zipup-canvas:${canvasId}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
      const setCursor = (id: string, cursor: Peer["cursor"], tool?: string) =>
        setPeers((ps) => ps.map((p) => (p.id === id ? { ...p, cursor, tool: tool ?? p.tool } : p)));

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState() as Record<string, { name?: string; color?: string }[]>;
          setPeers((prev) =>
            Object.entries(state)
              .filter(([id]) => id !== me.id)
              .map(([id, metas]) => {
                const old = prev.find((p) => p.id === id);
                return { id, name: metas[0]?.name ?? "?", color: metas[0]?.color ?? colorFor(id), cursor: old?.cursor ?? null, tool: old?.tool };
              }),
          );
        })
        .on("broadcast", { event: "cursor" }, ({ payload }) => {
          const p = payload as { id: string; x: number | null; y: number | null; tool?: string };
          setCursor(p.id, p.x === null || p.y === null ? null : { x: p.x, y: p.y }, p.tool);
        })
        .on("broadcast", { event: "stroke" }, ({ payload }) => {
          const p = payload as { stroke: Stroke; final: boolean };
          handlersRef.current.onStroke(p.stroke, p.final);
        })
        .on("broadcast", { event: "laser" }, ({ payload }) => handlersRef.current.onLaser(payload as LaserStroke))
        .on("broadcast", { event: "erase" }, ({ payload }) => handlersRef.current.onErase((payload as { ids: string[] }).ids))
        .on("broadcast", { event: "clear" }, () => handlersRef.current.onClear())
        .subscribe((s) => {
          if (cancelled) return;
          if (s === "SUBSCRIBED") {
            setStatus("live");
            void channel.track({ name: me.name, color: colorFor(me.id) });
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("off");
        });
      channelRef.current = channel as unknown as Channel;
      cleanup = () => {
        void channel.unsubscribe();
        void client.removeAllChannels();
      };
    })();
    return () => {
      cancelled = true;
      channelRef.current = null;
      cleanup?.();
    };
  }, [canvasId, me.id, me.name]);

  const lastCursor = React.useRef(0);
  const send = React.useCallback((event: string, payload: unknown, force = false) => {
    const ch = channelRef.current;
    // 혼자면 보내지 않음 (무료 메시지 한도 절약)
    if (!ch || (!force && !peersRef.current.length)) return;
    void ch.send({ type: "broadcast", event, payload });
  }, []);

  return {
    peers,
    status,
    sendCursor: React.useCallback(
      (pt: { x: number; y: number } | null, tool?: string) => {
        const now = performance.now();
        if (pt && now - lastCursor.current < 50) return;
        lastCursor.current = now;
        send("cursor", { id: me.id, x: pt?.x ?? null, y: pt?.y ?? null, tool });
      },
      [send, me.id],
    ),
    sendStroke: React.useCallback((stroke: Stroke, final: boolean) => send("stroke", { stroke, final }), [send]),
    sendLaser: React.useCallback((l: LaserStroke) => send("laser", l), [send]),
    sendErase: React.useCallback((ids: string[]) => send("erase", { ids }), [send]),
    sendClear: React.useCallback(() => send("clear", {}), [send]),
  };
}

/** 다른 사람 커서 (캔버스 좌표) */
export function RemoteCursors({ peers }: { peers: Peer[] }) {
  return (
    <ViewportPortal>
      {peers
        .filter((p) => p.cursor)
        .map((p) => (
          <div
            key={p.id}
            className="pointer-events-none absolute left-0 top-0 transition-transform duration-[90ms] ease-linear"
            style={{ transform: `translate(${p.cursor!.x}px, ${p.cursor!.y}px)`, zIndex: 20 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
              <path d="M2 1.5 L15.5 8.2 L9.2 9.6 L6.4 15.8 Z" fill={p.color} stroke="#0a0a0a" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span className="ml-3 mt-0.5 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-[#0a0a0a]" style={{ background: p.color }}>
              {p.name}
              {p.tool === "pen" ? " ✎" : p.tool === "laser" ? " ⚡" : ""}
            </span>
          </div>
        ))}
    </ViewportPortal>
  );
}

/** 지금 이 캔버스를 보고 있는 사람들 */
export function PeerStack({ peers, status, me }: { peers: Peer[]; status: "off" | "connecting" | "live"; me: { id: string; name: string } }) {
  if (status === "off") return null;
  const all = [{ id: me.id, name: `${me.name} (나)`, color: colorFor(me.id) }, ...peers];
  return (
    <div className="flex items-center">
      {all.slice(0, 6).map((p, i) => (
        <Tip key={p.id} content={p.name}>
          <span
            className={cn("flex size-7 items-center justify-center rounded-full border-2 border-[var(--panel)] text-[11px] font-semibold text-[#0a0a0a]", i && "-ml-2")}
            style={{ background: p.color, zIndex: 10 - i }}
          >
            {p.name.replace(/\s*\(나\)$/, "").slice(0, 1)}
          </span>
        </Tip>
      ))}
      {all.length > 6 && <span className="-ml-2 flex size-7 items-center justify-center rounded-full border-2 border-[var(--panel)] bg-panel-3 text-[10px]">+{all.length - 6}</span>}
      <span className={cn("ml-2 flex items-center gap-1 text-[11px]", status === "live" ? "text-success" : "text-fg-4")}>
        <span className={cn("size-1.5 rounded-full", status === "live" ? "bg-success" : "bg-fg-4")} />
        {status === "live" ? (peers.length ? `${peers.length + 1}명 접속` : "실시간") : "연결 중"}
      </span>
    </div>
  );
}
