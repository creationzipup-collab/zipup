import * as React from "react";

const noop = () => () => {};

/** 하이드레이션이 끝난 뒤에만 true — 서버에 없는 클라이언트 캐시 값을 그릴 때 불일치 방지 */
export function useIsClient(): boolean {
  return React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
