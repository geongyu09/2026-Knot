import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type RefObject } from "react";

import { DOCK_HOVER_GUIDE_DELAY_MS } from "../constants/dockHint";

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
 * 접힌 독의 채팅·녹음 버튼에 올리거나 포커스하면 한 줄 안내를 띄워요.
 *
 * 스쳐 지나갈 때는 뜨지 않도록 {@link DOCK_HOVER_GUIDE_DELAY_MS} 뒤에 뜨고, 벗어나면 사라져요.
 * 안내 꼬리가 그 버튼을 가리키도록 올린 버튼의 가운데 위치를 함께 재요.
 * 첫 사용 안내와 겹쳐 띄우지 않아요. `bind(kind)`가 돌려주는 핸들러를 버튼을 감싼 요소에 붙여요.
 */
export const useDockHoverGuide = ({ stageRef, isEnabled }: UseDockHoverGuideParams) => {
  const [hoverGuide, setHoverGuide] = useState<DockHoverGuide | null>(null);
  const timerRef = useRef(0);

  const clear = () => {
    window.clearTimeout(timerRef.current);
    setHoverGuide(null);
  };

  useEffect(() => {
    if (!isEnabled) clear();
  }, [isEnabled]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const bind = (kind: DockHoverGuideKind) => {
    const start = (event: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
      const target = event.currentTarget.getBoundingClientRect();
      const stage = stageRef.current?.getBoundingClientRect();
      const tailOffset = stage ? target.left + target.width / 2 - (stage.left + stage.width / 2) : 0;

      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setHoverGuide({ kind, tailOffset }), DOCK_HOVER_GUIDE_DELAY_MS);
    };

    return { onPointerEnter: start, onPointerLeave: clear, onFocus: start, onBlur: clear };
  };

  return { hoverGuide: isEnabled ? hoverGuide : null, bind };
};
