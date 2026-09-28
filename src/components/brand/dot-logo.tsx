"use client";

import * as React from "react";

import { CREATION_PATHS, ZIPUP_PATHS } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

type Dot = { hx: number; hy: number; x: number; y: number; vx: number; vy: number; seed: number };

/**
 * 점(도트 매트릭스)으로 그린 CREATION ZIPUP 로고.
 * 처음엔 흩어진 점들이 모여 글자가 되고, 커서가 지나가면 밀려났다가 제자리로 돌아와요.
 * 동작 줄이기를 켜면 멈춘 채로 그려요. 화면에 안 보이면 계산도 멈춰요.
 */
export function DotLogo({ className, gap = 7, radius = 1.55, lines = "both" }: { className?: string; gap?: number; radius?: number; lines?: "both" | "zipup" }) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const canvas = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    let dots: Dot[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let start = performance.now();
    const pointer = { x: -9999, y: -9999, active: false };
    const style = getComputedStyle(el);
    const fg = style.getPropertyValue("--fg").trim() || "#f4f4f5";
    const accent = style.getPropertyValue("--accent").trim() || "#ff5b24";

    // 로고 모양을 격자로 훑어 점 위치 만들기
    function build() {
      const rect = el!.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      const vbW = 1030;
      const vbH = lines === "both" ? 273 : 152;
      const scale = w / vbW;
      h = Math.max(1, Math.round(vbH * scale));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv!.width = w * dpr;
      cv!.height = h * dpr;
      cv!.style.width = `${w}px`;
      cv!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const o = off.getContext("2d")!;
      o.scale(scale, scale);
      o.fillStyle = "#000";
      if (lines === "both") {
        for (const d of CREATION_PATHS) o.fill(new Path2D(d), "evenodd");
        o.translate(0, 121);
      }
      for (const d of ZIPUP_PATHS) o.fill(new Path2D(d));
      const data = o.getImageData(0, 0, w, h).data;
      const step = Math.max(4, gap);
      const next: Dot[] = [];
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          const a = data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3];
          if (a > 110) {
            const seed = Math.random();
            // 시작 위치: 아래쪽에서 흩어져 올라옴
            const sx = still ? x : x + (Math.random() - 0.5) * w * 0.5;
            const sy = still ? y : y + h * (0.6 + Math.random() * 0.9);
            next.push({ hx: x, hy: y, x: sx, y: sy, vx: 0, vy: 0, seed });
          }
        }
      }
      dots = next;
      start = performance.now();
    }

    function draw(now: number) {
      ctx!.clearRect(0, 0, w, h);
      const t = (now - start) / 1000;
      const R = Math.max(60, w * 0.09);
      for (const d of dots) {
        if (!still) {
          // 모이는 시간을 점마다 조금씩 다르게
          const delay = d.seed * 0.55;
          const k = t < delay ? 0 : 0.085;
          let fx = (d.hx - d.x) * k;
          let fy = (d.hy - d.y) * k;
          if (pointer.active) {
            const dx = d.x - pointer.x;
            const dy = d.y - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist < R && dist > 0.01) {
              const f = (1 - dist / R) * 3.2;
              fx += (dx / dist) * f;
              fy += (dy / dist) * f;
            }
          }
          d.vx = (d.vx + fx) * 0.8;
          d.vy = (d.vy + fy) * 0.8;
          d.x += d.vx;
          d.y += d.vy;
        }
        const off = Math.hypot(d.x - d.hx, d.y - d.hy);
        // 제자리에서 벗어난 점은 포인트 컬러로 살짝 빛나요
        const heat = Math.min(1, off / 26);
        // 가끔 반짝이는 점 (LED 느낌)
        const twinkle = still ? 0 : Math.max(0, Math.sin(now / 900 + d.seed * 40)) ** 24;
        ctx!.globalAlpha = Math.min(1, 0.78 + twinkle * 0.22);
        ctx!.fillStyle = heat > 0.08 ? accent : fg;
        ctx!.beginPath();
        ctx!.arc(d.x, d.y, radius + heat * 0.9 + twinkle * 0.5, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function loop(now: number) {
      draw(now);
      if (!still && visible) raf = requestAnimationFrame(loop);
    }

    build();
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      build();
      if (still) draw(performance.now());
    });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was && !still) raf = requestAnimationFrame(loop);
    });
    io.observe(el);

    function move(e: PointerEvent) {
      const r = cv!.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.active = pointer.x > -80 && pointer.y > -80 && pointer.x < w + 80 && pointer.y < h + 80;
    }
    function leave() {
      pointer.active = false;
    }
    if (fine && !still) {
      window.addEventListener("pointermove", move, { passive: true });
      document.addEventListener("pointerleave", leave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, [gap, radius, lines]);

  return (
    <div ref={wrap} className={cn("relative w-full select-none", className)} role="img" aria-label="CREATION ZIPUP">
      <canvas ref={canvas} className="block" />
    </div>
  );
}
