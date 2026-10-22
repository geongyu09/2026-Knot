import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { hexToRgb } from "@utils/hexToRgb";
import { useRef, type PointerEvent } from "react";

import { SEED_CANVAS_HEIGHT, SEED_CANVAS_OVERFLOW, SEED_PILL_HEIGHT, SEED_WAVE_BOTTOM } from "../constants/dockSeed";
import { useDockSeed, type SeedSplitTargets } from "../model/useDockSeed";

interface DockSeedProps {
  /** `true`면 파형이 독 자리로 갈라져 사라지고, `false`면 다시 파형으로 모여요 */
  isOpen: boolean;
  /** 녹음 소리를 읽는 분석기. 파형이 목소리를 따라요. 다른 탭의 녹음이면 없어요 */
  analyser: AnalyserNode | null;
  /** `false`면 일시정지라 소리를 읽지 않아요 */
  isActive: boolean;
  /** 파형 옆에 보여 줄 녹음한 시간 */
  elapsedTime: string;
  splitTargets: SeedSplitTargets;
  /** 입자를 눌렀을 때. 파동이 퍼지며 독이 열려요(터치·키보드는 열린 채로 머물러요) */
  onOpen: (options?: { keepOpen?: boolean }) => void;
}

/**
 * 다른 화면에서 녹음이 이어질 때 접힌 독 자리에 흐르는 입자 파형.
 *
 * 녹음 바와 같은 청록 파형이 길게 흐르며 목소리를 따르고 옆에 녹음한 시간이 보여요.
 * 올리면 입자가 독 모양(알약 윤곽, 채팅 아이콘, 녹음 칩 자리)으로 모이고 그 자리에 진짜 독이 나타나요. 벗어나면 다시 파형으로 돌아가요.
 * 입자 위에서 포인터는 밀어내기를 일으키고, 누르면 파동이 퍼져요.
 * 파형 자체는 장식이라 낭독기에서 숨기고, 누르는 자리는 「독 열기」 버튼이에요. 키보드로는 Enter나 Space로 열어요.
 */
export default function DockSeed({ isOpen, analyser, isActive, elapsedTime, splitTargets, onOpen }: DockSeedProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 독과 같은 알약 위라 독 안의 녹음 칩과 같은 밝은 입자예요
  const light = hexToRgb(theme.neutral[300]);

  const { setPointer, clearPointer, pulse } = useDockSeed({
    canvasRef,
    isOpen,
    analyser,
    isActive,
    splitTargets,
    palette: {
      wave: [`rgba(${hexToRgb(theme.neutral[0])},0.95)`, `rgba(${hexToRgb(theme.neutral[200])},0.7)`, `rgba(${light},0.4)`],
      light: [`rgba(${hexToRgb(theme.neutral[0])},0.92)`, `rgba(${light},0.7)`, `rgba(${light},0.32)`],
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
      {/* 파형과 시간을 담는 독과 같은 알약. 홈 카드 위를 지나가도 파형이 글자와 섞이지 않아요 */}
      <DockPill aria-hidden="true" $isVisible={!isOpen} />
      <Canvas ref={canvasRef} aria-hidden="true" $isOpen={isOpen} />
      <ElapsedTime aria-hidden="true" $isVisible={!isOpen}>
        {elapsedTime}
      </ElapsedTime>
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

/**
 * 파형과 시간을 담는 알약. 독과 같은 Neutral 800 바탕과 그림자라, 올리면 그 자리에서 독으로 이어져요.
 * 홈 위에 떠 있는 동안 뒤를 살짝 비추는 유리 질감이라 스크롤로 지나가는 카드와 글자가 흐릿하게 어려요. 독이 나타나면 독에 자리를 내줘요
 */
const DockPill = styled.span<{ $isVisible: boolean }>`
  position: absolute;
  bottom: ${(SEED_WAVE_BOTTOM - SEED_CANVAS_OVERFLOW - SEED_PILL_HEIGHT / 2) / 16}rem; /* 파형 가운데가 알약 가운데예요 */
  left: calc(50% - min(11.25rem, 30%) - 1.5rem); /* 파형 왼쪽 끝에서 24px 바깥 */
  width: calc(min(22.5rem, 60%) + 6.75rem); /* 파형 + 시간(44px) + 양옆 여백 */
  height: ${SEED_PILL_HEIGHT / 16}rem;
  border: 1px solid ${({ theme }) => `rgba(${hexToRgb(theme.neutral[0])}, 0.08)`};
  border-radius: 6.25rem; /* 100px */
  /* 독과 같은 색이지만 비쳐서, 스크롤로 뒤를 지나가는 카드와 글자가 흐릿한 빛 덩어리로 어려요. 86%는 거의 안 비쳐서 68%로 두고 흐림은 8px로 줄여 글자 덩어리가 보이게 해요 */
  background-color: ${({ theme }) => `rgba(${hexToRgb(theme.neutral[800])}, 0.68)`};
  box-shadow:
    inset 0 1px 0 ${({ theme }) => `rgba(${hexToRgb(theme.neutral[0])}, 0.1)`},
    ${({ theme }) => theme.shadow03};
  backdrop-filter: blur(8px) saturate(1.2);
  -webkit-backdrop-filter: blur(8px) saturate(1.2);
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transition: opacity 0.2s;
  pointer-events: none;
  z-index: 1; /* 파형 캔버스(2) 아래, 독(1)과 같은 층이지만 독이 나타나면 숨어요 */
`;

/** 독 자리 위로 넉넉히 그려요. 열린 뒤에는 독이 포인터를 받도록 비켜요 */
const Canvas = styled.canvas<{ $isOpen: boolean }>`
  position: absolute;
  bottom: -${SEED_CANVAS_OVERFLOW / 16}rem; /* 알약 아래 윤곽이 잘리지 않게 독보다 더 내려가요 */
  left: 0;
  width: 100%;
  height: ${SEED_CANVAS_HEIGHT / 16}rem;
  pointer-events: none;
  z-index: ${({ $isOpen }) => ($isOpen ? 3 : 2)}; /* 독(1)보다 위에서 그려요 */
`;

/** 파형 오른쪽 끝 옆에 세로 가운데로 놓여요. 파형 폭은 열 폭의 60%, 최대 360px이에요 */
const ElapsedTime = styled.span<{ $isVisible: boolean }>`
  position: absolute;
  bottom: ${(SEED_WAVE_BOTTOM - SEED_CANVAS_OVERFLOW) / 16}rem;
  left: calc(50% + min(11.25rem, 30%) + 0.75rem); /* 파형 절반(최대 180px) + 12px */
  transform: translateY(50%);
  /* 입자 파형처럼 가볍게. 굵은 라벨 대신 중간 굵기에 자간을 살짝 띄우고, 어두운 알약 위라 밝은 글자예요 */
  color: ${({ theme }) => theme.neutral[100]};
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  white-space: nowrap;
  opacity: ${({ $isVisible }) => ($isVisible ? 0.9 : 0)};
  transition: opacity 0.2s;
  pointer-events: none;
  z-index: 2; /* 알약(1) 위에 놓여요 */
  ${({ theme }) => theme.text.caption02};
  font-weight: 500;
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
