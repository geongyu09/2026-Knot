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
  /** 입자를 눌렀을 때. 파동이 퍼지며 독이 열려요(터치·키보드는 열린 채로 머물러요) */
  onOpen: (options?: { keepOpen?: boolean }) => void;
}

/**
 * 독이 접혀 있을 때 독 자리에 떠 있는 입자.
 *
 * 대기 중엔 입자가 독을 그대로 스케치해요(알약 윤곽, 채팅 아이콘, 붉은 녹음 구슬). 녹음 중엔 녹음 바와 같은 청록 파형이
 * 길게 흐르며 목소리를 따르고 아래에 녹음한 시간이 보여요. 올리면 그 자리에 진짜 독이 나타나고, 벗어나면 다시 입자로 돌아가요.
 * 입자 위에서 포인터는 밀어내기를 일으키고, 누르면 파동이 퍼져요.
 * 파형 자체는 장식이라 낭독기에서 숨기고, 누르는 자리는 「독 열기」 버튼이에요. 키보드로는 Enter나 Space로 열어요.
 */
export default function DockSeed({ isOpen, tone, analyser, isActive, elapsedTime, hasRecordSide, splitTargets, onOpen }: DockSeedProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 주변 카드·글처럼 부드럽게 보이도록 스케치는 Neutral 600~700의 옅은 잉크, 구슬은 채도를 낮춘 붉은 톤을 써요
  const ink = hexToRgb(theme.neutral[700]);
  const strong = hexToRgb(theme.neutral[800]);
  const frame = hexToRgb(theme.neutral[500]);
  const accent = hexToRgb(theme.sub.accent[500]);
  const light = hexToRgb(theme.neutral[300]);
  const warning = hexToRgb(theme.sub.warning[600]);
  const warningDeep = hexToRgb(theme.sub.warning[700]);

  const { setPointer, clearPointer, pulse } = useDockSeed({
    canvasRef,
    isOpen,
    tone,
    analyser,
    isActive,
    hasRecordSide,
    splitTargets,
    palette: {
      ink: [`rgba(${strong},0.72)`, `rgba(${ink},0.5)`, `rgba(${frame},0.3)`],
      teal: [`rgba(${accent},0.9)`, `rgba(${accent},0.55)`, `rgba(${accent},0.28)`],
      orb: [
        `rgba(${hexToRgb(theme.sub.warning[200])},0.75)`,
        `rgba(${warning},0.5)`,
        `rgba(${warning},0.62)`,
        `rgba(${warningDeep},0.62)`,
        `rgba(${warningDeep},0.45)`,
      ],
      light: [`rgba(${hexToRgb(theme.neutral[0])},0.95)`, `rgba(${light},0.75)`, `rgba(${light},0.4)`],
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
        // 열려 있는 동안은 독이 위를 덮어 누를 일이 없지만, 포인터가 들어오고 나가는 기준이 흔들리지 않게 자리는 그대로 둬요
        aria-hidden={isOpen}
        tabIndex={isOpen ? -1 : 0}
        onPointerMove={(event) => {
          const point = toCanvas(event);
          if (point) setPointer(point.x, point.y);
        }}
        onPointerLeave={clearPointer}
        onPointerDown={handlePointerDown}
        // 마우스 클릭은 벗어나면 닫히고, 터치와 키보드(Enter·Space는 아래에서 따로)는 열린 채 머물러요
        onClick={() => onOpen()}
        onTouchEnd={() => onOpen({ keepOpen: true })}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) pulse(rect.width / 2, rect.height - SEED_WAVE_BOTTOM, rect.width, rect.height);
          onOpen({ keepOpen: true });
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
  z-index: ${({ $isOpen }) => ($isOpen ? 3 : 2)}; /* 독(1)보다 위에서 그려요 */
`;

/** 파형 오른쪽 끝 옆에 세로 가운데로 놓여요. 파형 폭은 열 폭의 60%, 최대 360px이에요 */
const ElapsedTime = styled.span<{ $isVisible: boolean }>`
  position: absolute;
  bottom: ${SEED_WAVE_BOTTOM / 16}rem;
  left: calc(50% + min(11.25rem, 30%) + 0.75rem); /* 파형 절반(최대 180px) + 12px */
  transform: translateY(50%);
  color: ${({ theme }) => theme.neutral[800]};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transition: opacity 0.2s;
  pointer-events: none;
  ${({ theme }) => theme.text.label01};
`;

/**
 * 입자 전체를 덮는 누르는 자리. 독보다 아래 층이라 열린 독이 위를 덮고, 독 밖의 입자 자리에서는 이 버튼이 포인터를 받아요.
 * 열리든 닫히든 모양이 같아, 포인터가 독 자리에 있는지 판단이 상태에 따라 흔들리지 않아요.
 */
const HitArea = styled.button`
  position: absolute;
  bottom: -0.75rem; /* -12px */
  left: 50%;
  transform: translateX(-50%);
  width: min(26.25rem, 100%); /* 420px */
  height: 7.5rem; /* 120px */
  border-radius: 1.875rem; /* 30px */
  cursor: pointer;
  z-index: 0;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 4px;
  }
`;
