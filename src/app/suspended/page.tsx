import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoFull } from "@/components/brand/logo";
import { getCurrentUser } from "@/lib/session";

import { PendingActions } from "../pending/pending-actions";

export const metadata: Metadata = { title: "이용 정지" };

export default async function SuspendedPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.status === "active") redirect("/");
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <LogoFull className="w-36" />
        <h1 className="text-2xl font-semibold">계정이 일시 정지됐어요</h1>
        <p className="text-sm text-fg-3">관리자에게 문의해 주세요.</p>
        <PendingActions />
      </div>
    </div>
  );
}
