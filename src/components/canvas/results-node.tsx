"use client";

import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { ArrowDownToLine, GalleryVerticalEnd } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { LiveDot } from "@/components/brand/hud";
import { Segmented } from "@/components/ui/controls";
import { Tip } from "@/components/ui/menu";
import { downloadZip } from "@/lib/client/assets";
import { cn } from "@/lib/utils";

import { useCanvas, type ResultsData } from "./canvas-context";
import { Port, PortLabel, Shell, TINT } from "./node-parts";
import { ResultsBoard } from "./results-list";

/**
 * 결과 리스트: 왼쪽 입력에 이미지·영상 생성 노드를 이으면, 그 노드들이 만든 결과가 실행할 때마다 쌓여요.
 * OK를 누른 결과만 오른쪽 출력으로 다음 노드에 넘어가요.
 */
export function ResultsNode({ id, data, selected }: NodeProps) {
  const d = data as ResultsData;
  const { updateNodeData } = useReactFlow();
  const { canEdit, nodeLabel, listRuns, listSources, flagOf, setFlag, openAssets, placeAsset, results, meId } = useCanvas();
  const [zipping, setZipping] = React.useState(false);
  const only = d.only ?? "all";
  const runs = listRuns(id);
  const sources = listSources(id);
  const all = runs.flatMap((r) => r.outputs);
  const ok = all.filter((o) => flagOf(o) === "pick");
  const running = runs.filter((r) => r.running).length;
  const shown = only === "ok" ? ok : all;

  async function zip() {
    if (!shown.length) return;
    setZipping(true);
    try {
      await downloadZip(
        shown.map((o) => ({ url: o.urls.download, filename: o.filename })),
        `${nodeLabel(id)}-${only === "ok" ? "OK-" : ""}${shown.length}.zip`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setZipping(false);
    }
  }

  return (
    <>
      <NodeResizer
        isVisible={!!selected && canEdit}
        minWidth={300}
        minHeight={280}
        lineClassName="!border-accent/35"
        handleClassName="!size-2.5 !rounded-[3px] !border-0 !bg-accent"
      />
      <Shell
        selected={selected}
        icon={<GalleryVerticalEnd />}
        title={nodeLabel(id)}
        accent={TINT.media}
        className="h-full w-full"
        right={
          <span className="flex items-center gap-2">
            {running > 0 && <LiveDot />}
            <span className="num text-[22px] leading-none text-fg">{all.length}</span>
          </span>
        }
      >
        {/* 입력: 생성 노드의 결과 */}
        <Port type="target" id="collect" port="media" top={20} label="결과를 모을 생성 노드" />

        <div className="nodrag flex shrink-0 items-center gap-2 px-3 pt-2.5">
          <Segmented
            size="xs"
            value={only}
            onChange={(v) => updateNodeData(id, { only: v })}
            options={[
              { value: "all", label: `전체 ${all.length}` },
              { value: "ok", label: `OK ${ok.length}` },
            ]}
          />
          <span className="flex-1" />
          <Tip content={only === "ok" ? "OK한 결과 받기" : "보이는 결과 모두 받기"}>
            <button
              type="button"
              disabled={!shown.length || zipping}
              onClick={zip}
              className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] text-fg-3 transition hover:bg-white/[0.06] hover:text-fg disabled:opacity-40"
            >
              <ArrowDownToLine className={cn("size-3.5", zipping && "animate-pulse")} /> 받기
            </button>
          </Tip>
        </div>

        <div className="nodrag nowheel min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3 scrollbar-thin">
          {!sources.length ? (
            <Empty title="생성 노드를 이어 주세요" body="이미지·영상 생성 노드의 출력을 왼쪽 위 점에 이으면, 실행할 때마다 결과가 여기 쌓여요." />
          ) : results.loading && !runs.length ? (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton aspect-square rounded-lg" />
              ))}
            </div>
          ) : !runs.length ? (
            <Empty title="아직 결과가 없어요" body="이어진 노드를 실행하면 실행한 순서대로 여기 쌓여요." />
          ) : only === "ok" && !ok.length ? (
            <Empty title="OK한 결과가 없어요" body="결과에 마우스를 올려 OK를 누르면, 그 결과가 다음 노드로 넘어가요." />
          ) : (
            <>
              <ResultsBoard
                runs={runs}
                only={only}
                me={meId}
                canEdit={canEdit}
                labelOf={nodeLabel}
                aliveOf={(nodeId) => sources.includes(nodeId)}
                flagOf={flagOf}
                onFlag={(o, f) => setFlag(o.id, f)}
                onOpen={openAssets}
                onPlace={(o) => placeAsset({ id: o.id, kind: o.kind, filename: o.filename, width: o.width, height: o.height, durationSec: o.durationSec, urls: o.urls }, id)}
              />
              {results.hasMore && (
                <button
                  type="button"
                  onClick={results.loadMore}
                  className="mt-3 w-full rounded-lg border border-dashed border-line-2 py-1.5 text-[11px] text-fg-3 transition hover:border-line-3 hover:text-fg"
                >
                  이전 결과 더 보기
                </button>
              )}
            </>
          )}
        </div>

        {/* 출력: OK한 결과 */}
        <div className="relative flex h-10 shrink-0 items-center border-t border-line px-3 pr-7 text-[11px]">
          {ok.length ? (
            <span className="text-fg-2">
              <span className="font-medium tabular-nums text-accent">OK {ok.length}개</span>가 다음 노드로 넘어가요
            </span>
          ) : (
            <span className="text-fg-4">OK한 결과가 다음 노드로 넘어가요</span>
          )}
          <PortLabel side="right" top="50%" className="text-accent/80">
            →
          </PortLabel>
        </div>
        <Port type="source" id="ok" port="media" top="calc(100% - 20px)" label="OK한 결과" />
      </Shell>
    </>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="corners flex h-full min-h-32 flex-col items-center justify-center gap-1.5 rounded-xl px-5 py-6 text-center">
      <p className="text-[12.5px] font-medium text-fg-2">{title}</p>
      <p className="text-[11px] leading-relaxed text-fg-4">{body}</p>
    </div>
  );
}
