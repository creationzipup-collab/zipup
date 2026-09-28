"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import * as React from "react";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/menu";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {/* 동작 줄이기 설정을 켠 사람에게는 움직임 대신 페이드만 */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={250}>
          {children}
          <Toaster
            position="bottom-right"
            theme="system"
            toastOptions={{
              classNames: {
                toast:
                  "!rounded-xl !border !border-line-2 !bg-elevated !text-fg !shadow-[var(--shadow-pop)] !font-sans",
                description: "!text-fg-3",
              },
            }}
          />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}

/** 테마 전환 (쿠키에 저장 → 서버 렌더에서 바로 적용) */
function subscribeTheme(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

export function useTheme() {
  // <html data-theme>을 외부 상태로 구독 (여러 컴포넌트가 같은 값을 봄)
  const theme = React.useSyncExternalStore(
    subscribeTheme,
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark" as const,
  );
  const setTheme = React.useCallback((t: "dark" | "light") => {
    const apply = () => {
      document.documentElement.dataset.theme = t;
      document.cookie = `zipup-theme=${t}; path=/; max-age=31536000; samesite=lax`;
    };
    // 지원 브라우저에서는 테마 전환을 부드럽게 교차 페이드
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(apply);
    else apply();
  }, []);
  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
