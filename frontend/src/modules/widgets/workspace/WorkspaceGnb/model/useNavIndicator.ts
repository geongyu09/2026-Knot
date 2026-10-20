import { useEffect, useLayoutEffect, useRef } from "react";

interface UseNavIndicatorParams {
  /** 탭 순서에서 지금 탭의 자리. 탭이 아닌 화면이면 -1이에요 */
  activeTabIndex: number;
}

interface PlaceIndicatorParams {
  container: HTMLElement;
  indicator: HTMLElement;
  /** 이전 탭 자리에서 미끄러져 올지. 아니면 모션 없이 제자리에 놓아요 */
  isSliding: boolean;
}

/** 지금 탭(`aria-current="page"`) 칸의 자리와 크기로 표시를 옮겨요 */
const placeIndicator = ({
  container,
  indicator,
  isSliding,
}: PlaceIndicatorParams) => {
  const activeTab = container.querySelector<HTMLElement>(
    '[aria-current="page"]',
  );
  if (!activeTab) return;

  indicator.dataset.sliding = String(isSliding);
  indicator.style.width = `${activeTab.offsetWidth}px`;
  indicator.style.height = `${activeTab.offsetHeight}px`;
  indicator.style.transform = `translate(${activeTab.offsetLeft}px, ${activeTab.offsetTop}px)`;
};

/**
 * 내비 필의 진한 표시 하나를 지금 탭 칸 아래에 놓아요.
 *
 * 탭이 바뀌면 이전 탭 자리에서 새 탭 자리로 미끄러지고, 폭도 새 칸에 맞춰 함께 바뀌어요.
 * 미끄러지는 중에 다시 바뀌면 지금 있는 자리에서 이어서 움직여요. CSS 전환이 그 자리에서 다시 출발하기 때문이에요.
 * 처음 그릴 때, 탭이 아닌 화면에서 탭으로 올 때, 창 크기나 글꼴이 바뀌어 칸 크기가 달라질 때는 모션 없이 제자리에 놓아요.
 * 처음 자리가 정해지기 전에 미끄러지면 필의 왼쪽 끝에서 날아오는 것처럼 보여서예요.
 */
export const useNavIndicator = ({ activeTabIndex }: UseNavIndicatorParams) => {
  const containerRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  /** 표시가 마지막으로 놓인 탭의 자리. 아직 놓이지 않았거나 숨었으면 -1이에요 */
  const placedTabIndexRef = useRef(-1);

  // 화면에 그리기 전에 옮겨야 표시가 이전 자리에 한 프레임 남지 않아요
  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;

    const placedTabIndex = placedTabIndexRef.current;
    placedTabIndexRef.current = activeTabIndex;
    if (activeTabIndex === -1) return;

    placeIndicator({
      container,
      indicator,
      isSliding: placedTabIndex !== -1 && placedTabIndex !== activeTabIndex,
    });
  }, [activeTabIndex]);

  useEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() =>
      placeIndicator({ container, indicator, isSliding: false }),
    );
    // 글꼴이 늦게 불러와지면 칸마다 폭이 달라지므로 필과 칸을 함께 봐요.
    // 표시는 미끄러지는 동안 폭이 바뀌어, 표시까지 보면 모션을 스스로 끊어요
    observer.observe(container);
    container
      .querySelectorAll("button")
      .forEach((tab) => observer.observe(tab));

    return () => observer.disconnect();
  }, []);

  return { containerRef, indicatorRef };
};
