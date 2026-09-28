"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  BookText,
  Clapperboard,
  FolderKanban,
  Hash,
  Home,
  ImagePlus,
  LayoutGrid,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Star,
  User,
  Workflow,
} from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useTheme } from "@/components/providers";
import { Kbd } from "@/components/ui/misc";
import { fetchJson } from "@/lib/utils";

type SearchResult = {
  projects: { id: string; name: string; color: string | null; isPersonal: boolean }[];
  assets: { id: string; filename: string; kind: string; thumb: string; prompt: string; projectName: string }[];
  tags: string[];
  people: { id: string; name: string; email: string }[];
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ open, onOpenChange, isAdmin }: { open: boolean; onOpenChange: (v: boolean) => void; isAdmin: boolean }) {
  const router = useRouter();
  const { toggle } = useTheme();
  const [q, setQ] = React.useState("");
  const dq = useDebounced(q.trim(), 180);
  const { data, isFetching } = useQuery({
    queryKey: ["quick-search", dq],
    queryFn: () => fetchJson<SearchResult>(`/api/search?q=${encodeURIComponent(dq)}`),
    enabled: open && dq.length > 0,
    staleTime: 10_000,
  });

  // 닫히면 검색어 초기화
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setQ("");
  }

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const item =
    "flex h-10 cursor-default select-none items-center gap-3 rounded-xl px-3 text-[13.5px] text-fg-2 outline-none data-[selected=true]:bg-panel-3 data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-3";
  const group = "px-1.5 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-4";

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="zi-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line-2 bg-elevated shadow-[var(--shadow-pop)] outline-none">
          <D.Title className="sr-only">검색</D.Title>
          <D.Description className="sr-only">프로젝트, 에셋, 페이지를 검색해요</D.Description>
          <Command shouldFilter={false} loop className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <svg className="size-4 text-fg-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="프로젝트, 프롬프트, 파일명, 태그, 사람 검색…"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-4"
              />
              {isFetching && <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" />}
              <Kbd>ESC</Kbd>
            </div>
            <Command.List className="max-h-[min(460px,60vh)] overflow-y-auto py-1.5 scrollbar-thin">
              <Command.Empty className="px-4 py-10 text-center text-sm text-fg-3">
                {dq ? "검색 결과가 없어요" : "무엇을 찾고 있나요?"}
              </Command.Empty>

              {dq && data && (
                <>
                  {data.assets.length > 0 && (
                    <Command.Group heading="에셋" className={group}>
                      {data.assets.map((a) => (
                        <Command.Item key={a.id} value={`asset-${a.id}`} onSelect={() => go(`/library?asset=${a.id}`)} className={item}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.thumb} alt="" className="size-7 rounded-md object-cover" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] text-fg">{a.prompt || a.filename}</span>
                            <span className="block truncate text-[11px] text-fg-4">
                              {a.projectName} · {a.filename}
                            </span>
                          </span>
                        </Command.Item>
                      ))}
                      <Command.Item value="asset-all" onSelect={() => go(`/library?q=${encodeURIComponent(dq)}`)} className={item}>
                        <LayoutGrid /> 라이브러리에서 &ldquo;{dq}&rdquo; 전체 결과 보기
                      </Command.Item>
                    </Command.Group>
                  )}
                  {data.projects.length > 0 && (
                    <Command.Group heading="프로젝트" className={group}>
                      {data.projects.map((p) => (
                        <Command.Item key={p.id} value={`project-${p.id}`} onSelect={() => go(`/projects/${p.id}`)} className={item}>
                          <FolderKanban /> {p.name}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {data.tags.length > 0 && (
                    <Command.Group heading="태그" className={group}>
                      {data.tags.map((t) => (
                        <Command.Item key={t} value={`tag-${t}`} onSelect={() => go(`/library?q=${encodeURIComponent("#" + t)}`)} className={item}>
                          <Hash /> {t}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {data.people.length > 0 && (
                    <Command.Group heading="사람" className={group}>
                      {data.people.map((p) => (
                        <Command.Item key={p.id} value={`person-${p.id}`} onSelect={() => go(`/library?q=${encodeURIComponent("@" + p.name)}`)} className={item}>
                          <User /> {p.name} <span className="text-xs text-fg-4">{p.email}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              )}

              {!dq && (
                <>
                  <Command.Group heading="만들기" className={group}>
                    <Command.Item value="img" onSelect={() => go("/create/image")} className={item}>
                      <ImagePlus /> 이미지 생성
                    </Command.Item>
                    <Command.Item value="vid" onSelect={() => go("/create/video")} className={item}>
                      <Clapperboard /> 영상 생성
                    </Command.Item>
                    <Command.Item value="canvas" onSelect={() => go("/canvas?new=1")} className={item}>
                      <Workflow /> 새 노드 캔버스
                    </Command.Item>
                    <Command.Item value="project" onSelect={() => go("/projects?new=1")} className={item}>
                      <Plus /> 새 프로젝트
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="이동" className={group}>
                    <Command.Item value="home" onSelect={() => go("/")} className={item}>
                      <Home /> 홈
                    </Command.Item>
                    <Command.Item value="library" onSelect={() => go("/library")} className={item}>
                      <LayoutGrid /> 라이브러리
                    </Command.Item>
                    <Command.Item value="fav" onSelect={() => go("/library?favorites=1")} className={item}>
                      <Star /> 즐겨찾기
                    </Command.Item>
                    <Command.Item value="projects" onSelect={() => go("/projects")} className={item}>
                      <FolderKanban /> 프로젝트
                    </Command.Item>
                    <Command.Item value="prompts" onSelect={() => go("/prompts")} className={item}>
                      <BookText /> 프롬프트 라이브러리
                    </Command.Item>
                    <Command.Item value="settings" onSelect={() => go("/settings")} className={item}>
                      <Settings /> 내 설정
                    </Command.Item>
                    {isAdmin && (
                      <Command.Item value="admin" onSelect={() => go("/admin")} className={item}>
                        <ShieldCheck /> 관리자
                      </Command.Item>
                    )}
                  </Command.Group>
                  <Command.Group heading="설정" className={group}>
                    <Command.Item
                      value="theme"
                      onSelect={() => {
                        toggle();
                        onOpenChange(false);
                      }}
                      className={item}
                    >
                      <Moon /> 테마 전환
                    </Command.Item>
                  </Command.Group>
                </>
              )}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-[11px] text-fg-4">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> 이동
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> 열기
              </span>
              <span className="ml-auto">라이브러리에서 model:, #태그, @사람, ★4 같은 고급 검색을 쓸 수 있어요</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
