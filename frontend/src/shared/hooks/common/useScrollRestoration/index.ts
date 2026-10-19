import { type RefObject, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

/** 뒤로 · 앞으로 가기로 돌아왔을 때, 내용이 보던 위치까지 길어지기를 기다리는 최대 시간(ms) */
const RESTORE_WAIT_MS = 2000;

/** 화면 기록(history 항목의 key)마다 보던 스크롤 위치. 같은 탭에서만 기억하고, 새로고침하면 비어요 */
const scrollTopByEntry = new Map<string, number>();

interface UseScrollRestorationParams {
  /** 창 대신 스크롤되는 요소. 예: 워크스페이스 레이아웃의 본문(main) */
  scrollRef: RefObject<HTMLElement | null>;
}

/**
 * 창이 아니라 요소 안에서 스크롤되는 화면에서, 화면을 옮길 때 그 요소의 스크롤 위치를 맞추는 훅.
 *
 * 브라우저는 창의 스크롤만 기록마다 되돌려 주고, 요소 안의 스크롤은 그대로 둬요. 그래서 이 훅이 대신 맞춰요.
 * - 링크 · 버튼으로 새 화면에 가면(push · replace) 맨 위에서 시작해요.
 * - 뒤로 · 앞으로 가기(pop)로 돌아오면 그 기록에서 보던 위치로 돌려요.
 *   내용을 다시 불러오는 중이라 아직 그만큼 길지 않으면, 길어질 때까지 기다렸다 맞춰요.
 *   `RESTORE_WAIT_MS` 안에 길어지지 않으면 맞추지 않아요. 늦게 튀어 오르는 것보다 그 자리에 두는 편이 덜 어색해요.
 * - 경로는 그대로이고 쿼리만 바뀌면(같은 화면에서 패널을 여닫음) 위치를 그대로 둬요.
 *
 * 보던 위치는 스크롤할 때마다 남겨요. 떠나는 순간에 읽으면, 다음 화면이 그려지며 짧아진 만큼 줄어든 값을 읽을 수 있어서예요.
 */
const useScrollRestoration = ({ scrollRef }: UseScrollRestorationParams) => {
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const previousPathnameRef = useRef(pathname);

  // 화면을 그린 직후에 바꿔 끼워야, 다음 화면이 짧아져 생기는 스크롤 이벤트를 앞 기록의 값으로 남기지 않아요
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const saveScrollTop = () => {
      scrollTopByEntry.set(key, element.scrollTop);
    };
    element.addEventListener("scroll", saveScrollTop, { passive: true });

    return () => element.removeEventListener("scroll", saveScrollTop);
  }, [key, scrollRef]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const isNewScreen = previousPathnameRef.current !== pathname;
    previousPathnameRef.current = pathname;

    if (!element || !isNewScreen) return;

    if (navigationType !== "POP") {
      element.scrollTop = 0;
      return;
    }

    const targetScrollTop = scrollTopByEntry.get(key) ?? 0;
    const deadline = Date.now() + RESTORE_WAIT_MS;
    let frameId = 0;

    const restore = () => {
      if (element.scrollHeight - element.clientHeight >= targetScrollTop) {
        element.scrollTop = targetScrollTop;
        return;
      }

      if (Date.now() >= deadline) return;

      frameId = requestAnimationFrame(restore);
    };
    restore();

    return () => cancelAnimationFrame(frameId);
  }, [key, navigationType, pathname, scrollRef]);
};

export default useScrollRestoration;
