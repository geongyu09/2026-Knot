import { useLayoutEffect, useState, type RefObject } from "react";

import type { SeedSplitTargets } from "./useDockSeed";

interface UseDockSplitTargetsParams {
  formRef: RefObject<HTMLFormElement | null>;
  isOpen: boolean;
  isExpanded: boolean;
  isMicVisible: boolean;
  isRecordingChipVisible: boolean;
}

/** 아직 재지 못했을 때의 자리. 접힌 독의 두 칸 가운데쯤이에요 */
const FALLBACK: SeedSplitTargets = { barWidth: 0, barHeight: 60, chatOffsetX: -22, recordOffsetX: 22 };

/**
 * 파형 입자가 갈라져 갈 자리를 실제 독 배치에서 재요.
 *
 * 독이 열리면 아직 투명하지만 배치는 끝나 있어, 말풍선 칸과 녹음 칸의 가운데를 독 가운데 기준으로 잰 값을 돌려줘요.
 * 녹음 칸이 없는 화면(녹음 화면)이면 녹음 쪽은 `null`이에요.
 */
export const useDockSplitTargets = ({
  formRef,
  isOpen,
  isExpanded,
  isMicVisible,
  isRecordingChipVisible,
}: UseDockSplitTargetsParams) => {
  const [splitTargets, setSplitTargets] = useState<SeedSplitTargets>(FALLBACK);

  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form || isExpanded) return;

    const measure = () => {
      const center = form.offsetWidth / 2;
      const offsetOf = (selector: string) => {
        const element = form.querySelector<HTMLElement>(selector);
        if (!element) return null;
        return element.offsetLeft + element.offsetWidth / 2 - center;
      };
      const chatOffsetX = offsetOf("[data-dock-chat]");
      const recordOffsetX = offsetOf("[data-dock-record]");
      if (chatOffsetX === null) return;

      setSplitTargets({ barWidth: form.offsetWidth, barHeight: form.offsetHeight, chatOffsetX, recordOffsetX });
    };
    measure();

    // 펼친 독이 접힐 때는 폭이 모션으로 줄어드는 중이라, 다 줄어든 뒤 한 번 더 재요
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target === form && event.propertyName === "width") measure();
    };
    form.addEventListener("transitionend", handleTransitionEnd);

    return () => form.removeEventListener("transitionend", handleTransitionEnd);
  }, [formRef, isExpanded, isMicVisible, isOpen, isRecordingChipVisible]);

  return { splitTargets };
};
