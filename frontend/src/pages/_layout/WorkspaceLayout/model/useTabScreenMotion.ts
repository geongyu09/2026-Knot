import {
  TAB_ENTER_EASING,
  TAB_SCREEN_DURATION_MS,
  TAB_SCREEN_OFFSET_PX,
  TAB_SCREEN_START_OPACITY,
} from "@constants/tabMotion";
import { useLayoutEffect, useRef, type RefObject } from "react";

interface UseTabScreenMotionParams {
  /** 화면이 그려지는 본문. 바로 아래 자식(화면)을 움직여요 */
  screenRootRef: RefObject<HTMLElement | null>;
  /** 탭 순서에서 지금 탭의 자리. 탭이 아닌 화면이면 -1이에요 */
  activeTabIndex: number;
}

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * GNB 탭을 옮길 때 새 화면을 탭 방향에서 살짝 밀어 넣으며 또렷하게 해요.
 *
 * 오른쪽 탭으로 가면 오른쪽에서, 왼쪽 탭으로 가면 왼쪽에서 들어와요. 뒤로 가기와 앞으로 가기도 같아요.
 * 새 화면은 반쯤 보이는 데서 시작해요. 투명에서 시작하면 그 순간 배경만 보여 깜빡여 보여요.
 * 같은 탭 안의 이동, 처음 들어올 때와 새로고침, 탭이 아닌 화면을 오갈 때는 움직이지 않아요.
 * 움직임 줄이기를 켜 두었거나 모션을 그릴 수 없는 브라우저에서는 바로 바꿔요.
 *
 * 화면 요소를 다시 만들지 않고 이미 그린 화면에 모션만 걸어서, 화면 안의 스크롤, 입력, 답변 상태는 그대로예요.
 */
export const useTabScreenMotion = ({
  screenRootRef,
  activeTabIndex,
}: UseTabScreenMotionParams) => {
  // 처음 그릴 때는 지금 탭과 같아 움직이지 않아요
  const previousTabIndexRef = useRef(activeTabIndex);
  /** 이 훅이 걸어 둔 모션. 화면이 제 모션을 따로 가지고 있어도 그건 건드리지 않아요 */
  const screenAnimationsRef = useRef<Animation[]>([]);

  // 새 화면이 그려지기 전에 걸어야 제자리에 한 프레임 먼저 보이지 않아요
  useLayoutEffect(() => {
    const previousTabIndex = previousTabIndexRef.current;
    previousTabIndexRef.current = activeTabIndex;

    const isTabSwitch =
      previousTabIndex !== -1 &&
      activeTabIndex !== -1 &&
      previousTabIndex !== activeTabIndex;
    const screenRoot = screenRootRef.current;
    if (!isTabSwitch || !screenRoot) return;

    // 연달아 누르면 앞서 건 모션을 지우고 마지막 탭의 모션만 남겨요
    screenAnimationsRef.current.forEach((animation) => animation.cancel());
    screenAnimationsRef.current = [];
    if (prefersReducedMotion()) return;

    const direction = activeTabIndex > previousTabIndex ? 1 : -1;

    Array.from(screenRoot.children).forEach((screen) => {
      if (typeof screen.animate !== "function") return;

      const animation = screen.animate(
        [
          {
            opacity: TAB_SCREEN_START_OPACITY,
            transform: `translateX(${direction * TAB_SCREEN_OFFSET_PX}px)`,
          },
          { opacity: 1, transform: "none" },
        ],
        { duration: TAB_SCREEN_DURATION_MS, easing: TAB_ENTER_EASING },
      );
      screenAnimationsRef.current.push(animation);
    });
  }, [activeTabIndex, screenRootRef]);
};
