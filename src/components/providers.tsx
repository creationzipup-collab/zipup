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
            theme="dark"
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
