"use client";

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";

/** 화면을 그리다 문제가 생기면: 촬영장 말로 "NG 테이크" */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center px-6">
      <div className="max-w-md animate-fade-up text-center">
        <p className="section-index uppercase">
          NG take{error.digest ? ` · ${error.digest}` : ""}
        </p>
        <h1 className="mt-3 font-display text-[88px] font-light leading-none tracking-[-0.05em] text-fg">NG</h1>
        <p className="mt-4 text-[16px] font-medium">이번 테이크는 NG예요 — 화면을 불러오다 문제가 생겼어요.</p>
        <p className="mt-1 text-sm text-fg-3">다시 찍어 보고, 계속되면 관리자에게 알려 주세요.</p>
        <div className="mt-7 flex justify-center gap-2">
          <Button variant="primary" onClick={() => retry()}>
            다시 찍기
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/">홈으로</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
