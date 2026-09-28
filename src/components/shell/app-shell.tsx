"use client";

import {
  BookText,
  Check,
  Clapperboard,
  FolderKanban,
  Home,
  ImagePlus,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGroup } from "motion/react";
import * as React from "react";

import { BrandLockup } from "@/components/brand/logo";
import { RollingNumber } from "@/components/brand/motion";
import { LiquidRail } from "@/components/shell/liquid-rail";
import { useTheme } from "@/components/providers";
import { CommandPalette } from "@/components/shell/command-palette";
import { NotificationsButton } from "@/components/shell/notifications";
import { QueueIndicator } from "@/components/shell/queue-indicator";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Tip,
} from "@/components/ui/menu";
import { Avatar, Kbd, Progress } from "@/components/ui/misc";
import { signOut } from "@/lib/auth-client";
import type { BudgetStatus } from "@/lib/services/budget";
import { ROLE_LABEL, type UserRole } from "@/lib/types";
import { cn, usd } from "@/lib/utils";

export type ShellUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  teamName: string | null;
  teamColor: string | null;
  /** 관리자에게만: 가입 승인 대기 인원 */
  pendingApprovals?: number;
};

type ShellCtx = { user: ShellUser; budget: BudgetStatus; mockMode: boolean; openPalette: () => void };
const ShellContext = React.createContext<ShellCtx | null>(null);

export function useShell(): ShellCtx {
  const ctx = React.useContext(ShellContext);
  if (!ctx) throw new Error("useShell outside AppShell");
  return ctx;
}

const NAV = [
  { href: "/", label: "홈", icon: Home, exact: true },
  { href: "/create/image", label: "이미지 생성", icon: ImagePlus },
  { href: "/create/video", label: "영상 생성", icon: Clapperboard },
  { href: "/canvas", label: "노드 캔버스", icon: Workflow },
  { href: "/library", label: "라이브러리", icon: LayoutGrid },
  { href: "/projects", label: "프로젝트", icon: FolderKanban },
  { href: "/prompts", label: "프롬프트", icon: BookText },
];

export function AppShell({
  user,
  budget,
  recentProjects,
  mockMode,
  children,
}: {
  user: ShellUser;
  budget: BudgetStatus;
  recentProjects: { id: string; name: string; color: string | null; isPersonal: boolean }[];
  mockMode: boolean;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const pathname = usePathname();

  // 페이지를 옮기면 모바일 메뉴 닫기
  const [prevPath, setPrevPath] = React.useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setNavOpen(false);
  }

  // 전역 단축키: ⌘K / Ctrl+K, "/" → 검색
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      // 노드 캔버스처럼 "/"를 직접 쓰는 화면에서는 양보
      if (!typing && e.key === "/" && !document.querySelector("[role=dialog]") && !document.querySelector("[data-owns-slash]")) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx = React.useMemo(
    () => ({ user, budget, mockMode, openPalette: () => setPaletteOpen(true) }),
    [user, budget, mockMode],
  );

  const sidebar = <SidebarInner user={user} budget={budget} recentProjects={recentProjects} pathname={pathname} />;

  return (
    <ShellContext.Provider value={ctx}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-bg-2 lg:flex">
          <LayoutGroup id="nav-desktop">{sidebar}</LayoutGroup>
        </aside>

        <Dialog open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" title={<BrandLockup />} className="w-[280px] lg:hidden">
            <div className="flex h-full flex-col">
              <LayoutGroup id="nav-mobile">{sidebar}</LayoutGroup>
            </div>
          </SheetContent>
        </Dialog>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-bg/75 px-3 backdrop-blur-xl sm:px-5">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="메뉴">
              <MenuIcon />
            </Button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="group flex h-9 w-full max-w-[420px] items-center gap-2.5 rounded-[10px] border border-line bg-panel/60 px-3 text-left text-[13px] text-fg-4 transition hover:border-line-2 hover:text-fg-3"
            >
              <Search className="size-4" />
              <span className="flex-1 truncate">프로젝트·에셋 검색, 페이지 이동…</span>
              <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
            </button>
            <div className="ml-auto flex items-center gap-1">
              {mockMode && (
                <Tip content="API 키가 없는 공급자는 모의 생성으로 동작해요 (실제 과금 없음)">
                  <span className="mr-1 hidden items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 font-mono text-[10.5px] font-semibold tracking-widest text-warning sm:inline-flex">
                    <span className="size-1.5 animate-pulse-dot rounded-full bg-warning" /> MOCK
                  </span>
                </Tip>
              )}
              <QueueIndicator />
              <NotificationsButton />
              <ThemeButton />
            </div>
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} isAdmin={user.role === "admin"} />
    </ShellContext.Provider>
  );
}

function ThemeButton() {
  const { theme, toggle } = useTheme();
  return (
    <Tip content={theme === "dark" ? "라이트 모드" : "다크 모드"}>
      <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="테마 전환">
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </Tip>
  );
}

function SidebarInner({
  user,
  budget,
  recentProjects,
  pathname,
}: {
  user: ShellUser;
  budget: BudgetStatus;
  recentProjects: { id: string; name: string; color: string | null; isPersonal: boolean }[];
  pathname: string;
}) {
  const router = useRouter();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));
  const activeKey = NAV.find((i) => isActive(i.href, i.exact))?.href ?? (isActive("/admin") ? "/admin" : null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hidden h-14 items-center px-5 lg:flex">
        <Link href="/" className="rounded-md" aria-label="ZIPUP AI 홈">
          <BrandLockup />
        </Link>
      </div>

      <div className="px-3 pb-2 pt-1">
        <Menu>
          <MenuTrigger asChild>
            <Button variant="primary" className="w-full justify-start gap-2.5">
              <Plus /> 새로 만들기
            </Button>
          </MenuTrigger>
          <MenuContent align="start" className="w-[222px]">
            <MenuItem onSelect={() => router.push("/create/image")}>
              <ImagePlus /> 이미지 생성
            </MenuItem>
            <MenuItem onSelect={() => router.push("/create/video")}>
              <Clapperboard /> 영상 생성
            </MenuItem>
            <MenuItem onSelect={() => router.push("/canvas?new=1")}>
              <Workflow /> 노드 캔버스
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => router.push("/projects?new=1")}>
              <FolderKanban /> 새 프로젝트
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <nav className="relative mx-3 flex flex-col gap-0.5 py-2 pl-2.5">
        <LiquidRail activeKey={activeKey} />
        {NAV.map((item) => {
          const active = isActive(item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-rail-key={item.href}
              className={cn(
                "group relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] transition-colors duration-200",
                active ? "font-medium text-fg" : "text-fg-3 hover:text-fg",
              )}
            >
              <Icon className={cn("size-[17px]", active ? "text-fg" : "text-fg-4 group-hover:text-fg-2")} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
        {user.role === "admin" && (
          <Link
            href="/admin"
            data-rail-key="/admin"
            className={cn(
              "group relative mt-1 flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] transition-colors duration-200",
              isActive("/admin") ? "font-medium text-fg" : "text-fg-3 hover:text-fg",
            )}
          >
            <ShieldCheck className="size-[17px] text-fg-4 group-hover:text-fg-2" strokeWidth={1.8} />
            관리자
            {!!user.pendingApprovals && (
              <span
                className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10.5px] font-semibold tabular-nums text-[#0a0a0a]"
                title={`승인 대기 ${user.pendingApprovals}명`}
              >
                {user.pendingApprovals}
              </span>
            )}
          </Link>
        )}
      </nav>

      <div className="mt-3 flex min-h-0 flex-1 flex-col px-3">
        <div className="flex items-center justify-between px-3 pb-1.5">
          <span className="eyebrow">Recent</span>
          <Link href="/projects" className="text-[11px] text-fg-4 hover:text-fg-2">
            전체
          </Link>
        </div>
        <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto scrollbar-thin">
          {recentProjects.map((p) => {
            const active = pathname.startsWith(`/projects/${p.id}`);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-lg px-3 text-[13px] transition",
                  active ? "bg-panel-2 text-fg" : "text-fg-3 hover:bg-panel/80 hover:text-fg",
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-[3px]"
                  style={{ background: p.isPersonal ? "var(--fg-3)" : p.color ?? "var(--accent)" }}
                />
                <span className="truncate">{p.name}</span>
              </Link>
            );
          })}
          {!recentProjects.length && <p className="px-3 py-2 text-xs text-fg-4">아직 프로젝트가 없어요</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <BudgetCard budget={budget} />
        <UserMenu user={user} />
      </div>
    </div>
  );
}

function BudgetCard({ budget }: { budget: BudgetStatus }) {
  const team = budget.team;
  const main = team?.cap ? { label: `${team.name} 예산`, spent: team.spent, cap: team.cap } : budget.user.cap ? { label: "개인 예산", spent: budget.user.spent, cap: budget.user.cap } : null;
  const pct = main ? (main.spent / main.cap) * 100 : 0;
  return (
    <Link href="/settings" className="block rounded-xl border border-line bg-panel/70 p-3 transition hover:border-line-2">
      <div className="flex items-center justify-between">
        <span className="eyebrow">This month</span>
        <span className="font-mono text-[11px] text-fg-3">{main ? `${Math.round(pct)}%` : "무제한"}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <RollingNumber value={budget.user.spent} format={usd} className="font-mono text-[17px] font-semibold tracking-tight" />
        <span className="text-[11px] text-fg-4">내 사용</span>
      </div>
      {main && (
        <>
          <Progress value={pct} tone={pct >= 100 ? "danger" : pct >= 80 ? "warning" : "fg"} className="mt-2 h-1" />
          <p className="mt-1.5 text-[11px] text-fg-4">
            {main.label} {usd(main.spent)} / {usd(main.cap)}
          </p>
        </>
      )}
    </Link>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-panel-2">
          <Avatar name={user.name} image={user.image} size={30} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium">{user.name}</span>
            <span className="flex items-center gap-1.5 truncate text-[11px] text-fg-4">
              {user.teamColor && <span className="size-1.5 rounded-full" style={{ background: user.teamColor }} />}
              {user.teamName ?? "팀 미지정"} · {ROLE_LABEL[user.role]}
            </span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-[224px]">
        <MenuLabel>{user.email}</MenuLabel>
        <MenuItem onSelect={() => router.push("/settings")}>
          <Settings /> 내 설정
        </MenuItem>
        <MenuItem onSelect={() => setTheme("dark")}>
          <Moon /> 다크 모드 {theme === "dark" && <Check className="ml-auto" />}
        </MenuItem>
        <MenuItem onSelect={() => setTheme("light")}>
          <Sun /> 라이트 모드 {theme === "light" && <Check className="ml-auto" />}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          onSelect={async () => {
            await signOut();
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut /> 로그아웃
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

