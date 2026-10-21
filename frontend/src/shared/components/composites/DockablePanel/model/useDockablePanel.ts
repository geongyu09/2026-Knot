import { SCREEN_CONDITION } from "@constants/breakpoint";
import useMediaQuery from "@hooks/common/useMediaQuery";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

interface UseDockablePanelParams {
  /** 고정했을 때 패널이 옮겨 갈 자리의 DOM id */
  dockTargetId: string;
  /** 고정 여부를 바깥에서 정할 때 넘기는 값. 넘기지 않으면 이 훅이 직접 들고 있어요 */
  dockedProp?: boolean;
  /** 트리거를 눌러 고정 여부가 바뀌었을 때 바깥에 알려요 */
  onDockedChange?: (isDocked: boolean) => void;
  /** 이 값이 바뀌면 띄운 패널을 닫아요. 예: 화면 주소. 좁은 화면에서 패널 안 항목을 눌러 화면을 옮기면 덮개가 닫혀요 */
  peekResetKey?: unknown;
}

/**
 * 트리거를 스쳐 지나가면 패널을 잠깐 띄우고(peek), 누르면 자리에 고정하는(dock) 상태.
 *
 * 포인터가 트리거에서 패널로 건너가는 동안에는 잠깐 둘 다 벗어나므로,
 * 벗어나자마자 닫지 않고 {@link PEEK_CLOSE_DELAY_MS}만큼 기다렸다 닫아요.
 *
 * 고정된 패널은 트리거 옆이 아니라 다른 자리에 그려야 해서, 그 자리의 DOM 요소를 찾아 함께 돌려줘요.
 * 마운트 뒤에 찾는 이유는 그 자리가 이 컴포넌트보다 늦게 그려질 수 있기 때문이에요.
 *
 * 고정 여부는 기본적으로 이 훅이 들고 있지만, 같은 자리를 여러 패널이 나눠 쓰면 하나만 고정돼야 하므로
 * `dockedProp`으로 바깥이 대신 정할 수 있어요.
 *
 * 1024 미만(태블릿, 모바일)에서는 본문 자리가 모자라 고정하지 않아요(RESP-R2). 스쳐서 띄우지 않고,
 * 누르면 덮개로 띄우고 다시 누르거나 바깥을 누르면 닫아요. 고정해 둔 상태는 데스크톱 폭으로 돌아오면 되살아나요.
 * 손가락으로 누를 때는 스치는 동작이 없으므로 어느 폭에서든 포인터 진입으로 띄우지 않아요(RESP-R9).
 */

/** 포인터가 트리거와 패널 사이의 빈 곳을 지나는 동안 패널을 닫지 않고 기다리는 시간 */
const PEEK_CLOSE_DELAY_MS = 150;

const useDockablePanel = ({
  dockTargetId,
  dockedProp,
  onDockedChange,
  peekResetKey,
}: UseDockablePanelParams) => {
  const [selfDocked, setSelfDocked] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [dockTarget, setDockTarget] = useState<HTMLElement | null>(null);
  const { isMatched: isBelowDesktop } = useMediaQuery(
    SCREEN_CONDITION.belowDesktop,
  );

  const isDocked = !isBelowDesktop && (dockedProp ?? selfDocked);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDockTarget(document.getElementById(dockTargetId));
  }, [dockTargetId]);

  const cancelScheduledClose = () => {
    if (closeTimerRef.current === null) return;

    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  useEffect(() => cancelScheduledClose, []);

  useEffect(() => {
    setIsPeeking(false);
  }, [peekResetKey]);

  const openPeek = () => {
    cancelScheduledClose();
    setIsPeeking(true);
  };

  const closePeek = () => {
    cancelScheduledClose();
    setIsPeeking(false);
  };

  const scheduleClosePeek = () => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(
      () => setIsPeeking(false),
      PEEK_CLOSE_DELAY_MS,
    );
  };

  const handlePointerEnter = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") return;

    openPeek();
  };

  const handlePointerLeave = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") return;

    scheduleClosePeek();
  };

  const handleBlur = (e: FocusEvent<HTMLElement>) => {
    // 패널 안으로 포커스가 옮겨 간 것뿐이라면 닫지 않아요
    if (e.currentTarget.contains(e.relatedTarget)) return;

    closePeek();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape") return;

    closePeek();
  };

  const handleToggleDock = () => {
    if (isBelowDesktop) {
      cancelScheduledClose();
      setIsPeeking((prev) => !prev);
      return;
    }

    closePeek();

    const nextDocked = !isDocked;

    setSelfDocked(nextDocked);
    onDockedChange?.(nextDocked);
  };

  /** 트리거와 패널을 함께 감싸는 요소에 붙여요. 둘 사이를 오갈 때 닫히지 않게 해요 */
  const rootProps = isBelowDesktop
    ? { onBlur: handleBlur, onKeyDown: handleKeyDown }
    : {
        onPointerEnter: handlePointerEnter,
        onPointerLeave: handlePointerLeave,
        onFocus: openPeek,
        onBlur: handleBlur,
        onKeyDown: handleKeyDown,
      };

  const triggerProps = {
    onClick: handleToggleDock,
  };

  return {
    isDocked,
    /** 고정돼 있을 때는 이미 자리를 차지하고 있으므로 따로 띄우지 않아요 */
    isPeeking: isPeeking && !isDocked,
    /** 좁은 화면이라 띄운 패널을 덮개로 그려야 하는지. 뒤를 흐리게 하고 바깥을 누르면 닫아요 */
    isOverlay: isBelowDesktop,
    closePeek,
    dockTarget,
    rootProps,
    triggerProps,
  };
};

export default useDockablePanel;
