"use client";

import { LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

export function PendingActions() {
  const router = useRouter();
  React.useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={() => router.refresh()}>
        <RefreshCw /> 상태 확인
      </Button>
      <Button
        variant="ghost"
        onClick={async () => {
          await signOut();
          router.replace("/login");
          router.refresh();
        }}
      >
        <LogOut /> 로그아웃
      </Button>
    </div>
  );
}
