import { useEffect, useState } from "react";

import { DOCK_GUIDE_LEAVE_MS } from "../constants/dockHint";
import type { DockGuideKind } from "../ui/DockGuide";

interface DockGuideRequest {
  kind: DockGuideKind;
  tailOffset: number;
}

/**
 * 안내가 사라질 때 바로 떼지 않고 잠깐 더 그려 사라지는 모션을 보여 줘요.
 *
 * 안내가 다른 종류로 바뀌면 모션 없이 바로 바꾸고, 없어지면 {@link DOCK_GUIDE_LEAVE_MS} 동안 `isLeaving`으로 남겼다가 떼요.
 */
export const useGuidePresence = (request: DockGuideRequest | null) => {
  const [shown, setShown] = useState<DockGuideRequest | null>(request);
  const [isLeaving, setIsLeaving] = useState(false);

  const kind = request?.kind ?? null;
  const tailOffset = request?.tailOffset ?? 0;

  // 값이 같은 새 객체가 매 렌더마다 들어와도 다시 그리지 않도록 종류와 꼬리 위치로만 봐요
  useEffect(() => {
    if (kind) {
      setShown({ kind, tailOffset });
      setIsLeaving(false);
      return;
    }

    setIsLeaving(true);
    const timer = window.setTimeout(() => {
      setShown(null);
      setIsLeaving(false);
    }, DOCK_GUIDE_LEAVE_MS);

    return () => window.clearTimeout(timer);
  }, [kind, tailOffset]);

  return { shown, isLeaving: isLeaving && shown !== null };
};
