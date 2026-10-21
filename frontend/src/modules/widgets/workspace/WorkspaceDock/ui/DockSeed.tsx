import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { hexToRgb } from "@utils/hexToRgb";
import { useRef, type PointerEvent } from "react";

import { SEED_CANVAS_HEIGHT, SEED_WAVE_BOTTOM } from "../constants/dockSeed";
import { useDockSeed, type DockSeedTone, type SeedSplitTargets } from "../model/useDockSeed";

interface DockSeedProps {
  /** `true`면 파형이 독 자리로 갈라져 사라지고, `false`면 다시 파형으로 모여요 */
  isOpen: boolean;
  tone: DockSeedTone;
  /** 녹음 소리를 읽는 분석기. 녹음 중 파형이 목소리를 따라요 */
  analyser: AnalyserNode | null;
  /** `false`면 일시정지라 소리를 읽지 않아요 */
  isActive: boolean;
  /** 녹음 중이면 파형 아래에 보여 줄 녹음한 시간 */
  elapsedTime: string | null;
  /** 녹음 쪽이 없는 화면(녹음 화면)이면 `false` */
  hasRecordSide: boolean;
  splitTargets: SeedSplitTargets;
  /** 파형을 눌렀을 때. 파동이 퍼진 뒤 독이 열려요 */
  onOpen: () => void;
}

/**
 * 독이 접혀 있을 때 독 자리에 떠 있는 입자.
 *
 * 대기 중엔 랜딩 문제 장면처럼 입자로 그린 「무엇이든 요청하세요」 말풍선과 붉은 점이 든 녹음 알약이 나란히 떠서
 * 채팅과 녹음을 할 수 있는 자리임을 보여 줘요. 녹음 중엔 랜딩 녹음 장면 같은 청록 파형이 목소리를 따르고 아래에 녹음한 시간이 보여요.
 * 올리면 입자가 포인터를 피하고, 누르면 파동이 퍼지며 독이 열려요.
 * 파형 자체는 장식이라 낭독기에서 숨기고, 누르는 자리는 「독 열기」 버튼이에요. 키보드로는 Enter나 Space로 열어요.
 */
export default function DockSeed({ isOpen, tone, analyser, isActive, elapsedTime, hasRecordSide, splitTargets, onOpen }: DockSeedProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ink = hexToRgb(theme.neutral[800]);
  const strong = hexToRgb(theme.neutral[900]);
  const accent = hexToRgb(theme.sub.accent[500]);
  const light = hexToRgb(theme.neutral[300]);
  const warning = hexToRgb(theme.sub.warning[600]);

  const { setPointer, clearPointer, pulse } = useDockSeed({
    canvasRef,
    isOpen,
    tone,
    analyser,
    isActive,
    hasRecordSide,
    splitTargets,
    palette: {
      ink: [`rgba(${strong},0.9)`, `rgba(${ink},0.6)`, `rgba(${ink},0.32)`],
      teal: [`rgba(${accent},0.95)`, `rgba(${accent},0.6)`, `rgba(${accent},0.3)`],
      red: [`rgba(${warning},0.95)`, `rgba(${warning},0.55)`],
      light: [`rgba(${hexToRgb(theme.neutral[0])},0.95)`, `rgba(${light},0.75)`, `rgba(${light},0.4)`],
      orb: [
        `rgba(${hexToRgb(theme.sub.warning[200])},0.95)`,
        `rgba(${warning},0.9)`,
        `rgba(${hexToRgb(theme.sub.warning[800])},0.95)`,
      ],
    },
  });

  const toCanvas = (event: PointerEvent<HTMLElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const point = toCanvas(event);
    if (point) pulse(point.x, point.y, point.width, point.height);
  };

  return (
    <>
      <Canvas ref={canvasRef} aria-hidden="true" $isOpen={isOpen} />
      {elapsedTime !== null && (
        <ElapsedTime aria-hidden="true" $isVisible={!isOpen}>
          {elapsedTime}
        </ElapsedTime>
      )}
      <HitArea
        type="button"
        aria-label="독 열기"
        $isOpen={isOpen}
        onPointerMove={(event) => {
          const point = toCanvas(event);
          if (point) setPointer(point.x, point.y);
        }}
        onPointerLeave={clearPointer}
        onPointerDown={handlePointerDown}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) pulse(rect.width / 2, rect.height - SEED_WAVE_BOTTOM, rect.width, rect.height);
          onOpen();
        }}
      />
    </>
  );
}

/** 독 자리 위로 넉넉히 그려요. 열린 뒤에는 독이 포인터를 받도록 비켜요 */
const Canvas = styled.canvas<{ $isOpen: boolean }>`
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: ${SEED_CANVAS_HEIGHT / 16}rem;
  pointer-events: none;
  z-index: ${({ $isOpen }) => ($isOpen ? 3 : 1)};
`;

const ElapsedTime = styled.span<{ $isVisible: boolean }>`
  position: absolute;
  bottom: 0.875rem; /* 14px */
  left: 50%;
  transform: translateX(-50%);
  color: ${({ theme }) => theme.neutral[800]};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transition: opacity 0.2s;
  pointer-events: none;
  ${({ theme }) => theme.text.label01};
`;

/** 파형 전체를 덮는 누르는 자리. 독이 열리면 포인터를 받지 않아요 */
const HitArea = styled.button<{ $isOpen: boolean }>`
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(26.25rem, 100%); /* 420px */
  height: 7.5rem; /* 120px */
  border-radius: 1.875rem; /* 30px */
  cursor: pointer;
  pointer-events: ${({ $isOpen }) => ($isOpen ? "none" : "auto")};
  z-index: 2;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 4px;
  }
`;
