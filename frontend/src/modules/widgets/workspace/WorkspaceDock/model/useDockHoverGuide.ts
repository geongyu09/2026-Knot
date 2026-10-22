import { useEffect, useRef, useState } from "react";

import { DOCK_HOVER_GUIDE_DELAY_MS } from "../constants/dockHint";

/** 올렸을 때 안내가 붙는 버튼 */
export type DockHoverGuideKind = "chat" | "record";

interface UseDockHoverGuideParams {
  /** `false`면 올려도 안내를 띄우지 않아요. 첫 사용 안내가 떠 있거나 독이 펼쳐져 있거나 녹음 중일 때예요 */
  isEnabled: boolean;
}

/**
 * 접힌 독의 채팅·녹음 버튼에 올리거나 포커스하면 한 줄 안내를 띄워요.
 *
 * 스쳐 지나갈 때는 뜨지 않도록 {@link DOCK_HOVER_GUIDE_DELAY_MS} 뒤에 뜨고, 벗어나면 바로 사라져요.
 * 첫 사용 안내와 겹쳐 띄우지 않아요. `bind(kind)`가 돌려주는 핸들러를 버튼을 감싼 요소에 붙여요.
 */
export const useDockHoverGuide = ({ isEnabled }: UseDockHoverGuideParams) => {
  const [hoverGuide, setHoverGuide] = useState<DockHoverGuideKind | null>(null);
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
    const start = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setHoverGuide(kind), DOCK_HOVER_GUIDE_DELAY_MS);
    };

    return { onPointerEnter: start, onPointerLeave: clear, onFocus: start, onBlur: clear };
  };

  return { hoverGuide: isEnabled ? hoverGuide : null, bind };
};
