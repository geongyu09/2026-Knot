import { useHasToast } from "@provider/context/toastContext";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

import { DOCK_HOVER_GUIDE_DELAY_MS, DOCK_HOVER_GUIDE_MAX_PER_VISIT } from "../constants/dockHint";
import { bumpHoverGuideCount, isWithinGuideVisits, readHoverGuideCount } from "../utils/dockHintStorage";

/** 올렸을 때 안내가 붙는 버튼 */
export type DockHoverGuideKind = "chat" | "record";

export interface DockHoverGuide {
  kind: DockHoverGuideKind;
  /** 안내 꼬리가 가리킬 자리. 독이 놓인 자리의 가로 가운데에서 버튼 가운데까지의 거리(px) */
  tailOffset: number;
}

interface UseDockHoverGuideParams {
  /** 안내가 놓이는 자리. 꼬리 위치를 이 요소의 가운데 기준으로 재요 */
  stageRef: RefObject<HTMLElement | null>;
  /** `false`면 올려도 안내를 띄우지 않아요. 첫 사용 안내가 떠 있거나 독이 펼쳐져 있거나 녹음 중일 때예요 */
  isEnabled: boolean;
}

/**
 * 접힌 독의 채팅·녹음 버튼에 올리면 한 줄 안내를 띄워요.
 *
 * 처음 배우는 동안만 알려주는 안내라 첫 사용 안내와 같은 기간(처음 세 번의 방문)에만 뜨고,
 * 한 방문에서 버튼마다 {@link DOCK_HOVER_GUIDE_MAX_PER_VISIT}번까지만 떠요. 그 뒤로는 버튼의 입자 변신만 남아요.
 * 스쳐 지나갈 때는 뜨지 않도록 {@link DOCK_HOVER_GUIDE_DELAY_MS} 뒤에 뜨고, 벗어나면 사라져요.
 * 키보드 포커스에는 붙이지 않아요(접근성 이름으로 충분해요). 토스트가 떠 있으면 토스트에 자리를 양보해요.
 * 안내 꼬리가 그 버튼을 가리키도록 올린 버튼의 가운데 위치를 함께 재요.
 * `bind(kind)`가 돌려주는 핸들러를 버튼을 감싼 요소에 붙여요.
 */
export const useDockHoverGuide = ({ stageRef, isEnabled }: UseDockHoverGuideParams) => {
  const hasToast = useHasToast();
  const [hoverGuide, setHoverGuide] = useState<DockHoverGuide | null>(null);
  const timerRef = useRef(0);

  const clear = () => {
    window.clearTimeout(timerRef.current);
    setHoverGuide(null);
  };

  const isAllowed = isEnabled && !hasToast;

  useEffect(() => {
    if (!isAllowed) clear();
  }, [isAllowed]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const bind = (kind: DockHoverGuideKind) => {
    const start = (event: PointerEvent<HTMLElement>) => {
      // 터치는 올리는 동작이 없어 누르는 순간 떴다 사라지기만 해요
      if (event.pointerType === "touch") return;
      if (!isWithinGuideVisits() || readHoverGuideCount(kind) >= DOCK_HOVER_GUIDE_MAX_PER_VISIT) return;

      const target = event.currentTarget.getBoundingClientRect();
      const stage = stageRef.current?.getBoundingClientRect();
      const tailOffset = stage ? target.left + target.width / 2 - (stage.left + stage.width / 2) : 0;

      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        bumpHoverGuideCount(kind);
        setHoverGuide({ kind, tailOffset });
      }, DOCK_HOVER_GUIDE_DELAY_MS);
    };

    return { onPointerEnter: start, onPointerLeave: clear };
  };

  return { hoverGuide: isAllowed ? hoverGuide : null, bind };
};
