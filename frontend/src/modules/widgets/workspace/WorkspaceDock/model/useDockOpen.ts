import { prefersReducedMotion } from "@utils/particleMotion";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { SEED_CLOSE_DELAY_MS } from "../constants/dockSeed";

interface UseDockOpenParams {
  /** 독 전체(파형과 알약)를 감싼 자리 */
  stageRef: RefObject<HTMLElement | null>;
  /** 펼쳐 있으면 닫지 않아요 */
  isExpanded: boolean;
  /** 적던 글이 남아 있으면 닫지 않아요 */
  hasMessage: boolean;
}

/** 캔버스를 그릴 수 있고 움직임 줄이기가 꺼져 있을 때만 파형을 써요. 아니면 늘 열린 독이에요 */
const canUseSeed = () => {
  if (typeof document === "undefined" || prefersReducedMotion()) return false;
  const context = document.createElement("canvas").getContext("2d");
  return context !== null;
};

/**
 * 독이 파형으로 접혀 있는지, 알약으로 열려 있는지를 정해요.
 *
 * 파형을 누르면 열리고, 포인터가 독을 벗어나거나 포커스가 나가거나 바깥을 누르면 잠시 뒤 닫혀요.
 * 펼쳐 있거나 적던 글이 남아 있으면 닫지 않아요. 터치로 열었을 때는 벗어나도 닫지 않고 바깥을 눌러야 닫혀요.
 * 캔버스를 못 쓰거나 움직임 줄이기 설정이면 파형 없이 늘 열려 있어 지금까지의 독과 똑같이 동작해요.
 */
export const useDockOpen = ({ stageRef, isExpanded, hasMessage }: UseDockOpenParams) => {
  const [isSeedSupported] = useState(canUseSeed);
  const [isOpenByUser, setIsOpenByUser] = useState(false);
  const isKeptOpenRef = useRef(false);
  const closeTimerRef = useRef(0);

  const isOpen = !isSeedSupported || isExpanded || hasMessage || isOpenByUser;

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
  }, []);

  const open = useCallback(
    ({ keepOpen = false } = {}) => {
      cancelClose();
      isKeptOpenRef.current = keepOpen;
      setIsOpenByUser(true);
    },
    [cancelClose],
  );

  const close = useCallback(() => {
    cancelClose();
    isKeptOpenRef.current = false;
    setIsOpenByUser(false);
  }, [cancelClose]);

  /** 포인터가 벗어났을 때처럼, 잠시 기다렸다 닫아요. 터치로 열었으면 그대로 둬요 */
  const scheduleClose = useCallback(() => {
    if (isKeptOpenRef.current) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setIsOpenByUser(false), SEED_CLOSE_DELAY_MS);
  }, [cancelClose]);

  // 바깥을 누르면 닫아요. 펼친 독의 접힘은 `useWorkspaceDock`이 따로 맡아요
  useEffect(() => {
    if (!isOpenByUser) return;

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (stageRef.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [close, isOpenByUser, stageRef]);

  useEffect(() => cancelClose, [cancelClose]);

  return { isSeedSupported, isOpen, open, close, scheduleClose, cancelClose };
};
