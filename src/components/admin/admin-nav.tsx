"use client";

import { Boxes, Gauge, History, Settings, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "개요", icon: Gauge, exact: true },
  { href: "/admin/users", label: "사용자·승인", icon: Users },
  { href: "/admin/teams", label: "팀·예산", icon: UsersRound },
  { href: "/admin/models", label: "모델·가격", icon: Boxes },
  { href: "/admin/settings", label: "설정", icon: Settings },
  { href: "/admin/audit", label: "감사 로그", icon: History },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-line scrollbar-none">
      {ITEMS.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition",
              active ? "border-fg text-fg" : "border-transparent text-fg-3 hover:text-fg-2",
            )}
          >
            <Icon className="size-4" /> {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
