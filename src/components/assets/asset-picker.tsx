"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Check, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import * as React from "react";

import { MediaThumb } from "@/components/assets/media";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { uploadFile } from "@/lib/client/upload";
import type { AssetListItem } from "@/lib/services/library";
import { ACCEPT_UPLOADS } from "@/lib/uploads";
import { cn, fetchJson } from "@/lib/utils";

export type PickedAsset = Pick<AssetListItem, "id" | "kind" | "filename" | "width" | "height" | "durationSec" | "urls">;

export function AssetPicker({
  open,
  onOpenChange,
  kind,
  max = 1,
  onPick,
  title = "라이브러리에서 선택",
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind?: "image" | "video";
  max?: number;
  onPick: (items: PickedAsset[]) => void;
  title?: string;
  projectId?: string;
}) {
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  const [scope, setScope] = React.useState<"all" | "mine" | "fav" | "project">(projectId ? "project" : "all");
  const [selected, setSelected] = React.useState<PickedAsset[]>([]);
  const [uploading, setUploading] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  // 열 때마다 선택 초기화
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setSelected([]);
  }

  const query = useInfiniteQuery({
    queryKey: ["asset-picker", kind, dq, scope, projectId],
    enabled: open,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ offset: String(pageParam), limit: "48" });
      if (kind) p.set("kind", kind);
      if (dq) p.set("q", dq);
      if (scope === "mine") p.set("mine", "1");
      if (scope === "fav") p.set("favorites", "1");
      if (scope === "project" && projectId) p.set("projectId", projectId);
      return fetchJson<{ items: AssetListItem[]; nextOffset: number | null }>(`/api/assets?${p}`);
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  function toggle(a: AssetListItem) {
    setSelected((prev) => {
      if (prev.some((x) => x.id === a.id)) return prev.filter((x) => x.id !== a.id);
      const item = { id: a.id, kind: a.kind, filename: a.filename, width: a.width, height: a.height, durationSec: a.durationSec, urls: a.urls };
      if (max === 1) return [item];
      if (prev.length >= max) return prev;
      return [...prev, item];
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" title={title} description={max > 1 ? `최대 ${max}개까지 고를 수 있어요.` : undefined}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="프롬프트, 파일명, #태그 검색"
              className="h-9 w-full rounded-[10px] border border-line-2 bg-panel-2/70 pl-9 pr-3 text-sm outline-none focus:border-fg-3"
              autoFocus
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple={max > 1}
            accept={ACCEPT_UPLOADS}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!files.length) return;
              setUploading(files.length);
              const done: PickedAsset[] = [];
              for (const f of files) {
                try {
                  const a = await uploadFile(f, { projectId });
                  if (!kind || a.kind === kind) done.push({ id: a.id, kind: a.kind, filename: a.filename, width: a.width, height: a.height, durationSec: a.durationSec, urls: a.urls });
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }
              setUploading(0);
              if (done.length) {
                setSelected((prev) => (max === 1 ? done.slice(0, 1) : [...prev, ...done].slice(0, max)));
                void query.refetch();
              }
            }}
          />
          <Button variant="secondary" size="sm" loading={uploading > 0} onClick={() => fileRef.current?.click()}>
            {!uploading && <Upload />} {uploading ? `${uploading}개 업로드 중` : "업로드"}
          </Button>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              ...(projectId ? [{ value: "project" as const, label: "이 프로젝트" }] : []),
              { value: "all", label: "전체" },
              { value: "mine", label: "내 파일" },
              { value: "fav", label: "즐겨찾기" },
            ]}
          />
        </div>
        <div
          className="grid max-h-[56vh] grid-cols-3 gap-2 overflow-y-auto p-4 scrollbar-thin sm:grid-cols-4 md:grid-cols-6"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight > el.scrollHeight - 300 && query.hasNextPage && !query.isFetchingNextPage) {
              void query.fetchNextPage();
            }
          }}
        >
          {query.isLoading &&
            Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-xl" />)}
          {!query.isLoading && items.length === 0 && (
            <div className="col-span-full">
              <EmptyState icon={<Search />} title="파일이 없어요" description="업로드하거나 먼저 생성해 보세요." />
            </div>
          )}
          {items.map((a) => {
            const idx = selected.findIndex((x) => x.id === a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a)}
                onDoubleClick={() => {
                  if (max === 1) {
                    onPick([{ id: a.id, kind: a.kind, filename: a.filename, width: a.width, height: a.height, durationSec: a.durationSec, urls: a.urls }]);
                    onOpenChange(false);
                  }
                }}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-xl border-2 transition",
                  idx >= 0 ? "border-fg" : "border-transparent hover:border-line-3",
                )}
              >
                <MediaThumb kind={a.kind} thumb={a.urls.thumb} src={a.urls.src} durationSec={a.durationSec} />
                {idx >= 0 && (
                  <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-inv font-mono text-[10px] font-bold text-inv-fg">
                    {max > 1 ? idx + 1 : <Check className="size-3" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <span className="mr-auto text-xs text-fg-3">{selected.length ? `${selected.length}개 선택됨` : "더블클릭하면 바로 선택돼요"}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant="primary"
            disabled={!selected.length}
            onClick={() => {
              onPick(selected);
              onOpenChange(false);
            }}
          >
            선택 완료
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
