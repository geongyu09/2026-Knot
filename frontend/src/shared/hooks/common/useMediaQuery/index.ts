import { useCallback, useSyncExternalStore } from "react";

// jsdom처럼 matchMedia가 없는 환경은 데스크톱(어느 조건에도 맞지 않음)으로 봐요
const getMediaQueryList = (query: string) =>
  typeof window.matchMedia === "function" ? window.matchMedia(query) : null;

/**
 * 화면이 미디어 조건에 맞는지 돌려주고, 창 크기가 바뀌면 다시 그려요.
 *
 * 스타일만 바뀌면 되는 곳은 CSS 미디어 쿼리(`MEDIA_QUERY`)를 쓰고,
 * 동작이 달라져야 하는 곳(예: 좁은 화면에서는 패널을 고정하지 않음)에서만 써요.
 *
 * @example
 * const { isMatched: isBelowDesktop } = useMediaQuery(SCREEN_CONDITION.belowDesktop);
 */
const useMediaQuery = (query: string) => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mediaQueryList = getMediaQueryList(query);

      mediaQueryList?.addEventListener("change", onChange);

      return () => mediaQueryList?.removeEventListener("change", onChange);
    },
    [query],
  );

  const isMatched = useSyncExternalStore(
    subscribe,
    () => getMediaQueryList(query)?.matches ?? false,
    () => false,
  );

  return { isMatched };
};

export default useMediaQuery;
