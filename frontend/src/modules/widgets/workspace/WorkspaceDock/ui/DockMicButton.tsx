import ParticleOrb, { type ParticleOrbHandle } from "@composites/ParticleOrb";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { useRef, useState } from "react";

import { DOCK_ORB_CANVAS_SIZE, DOCK_ORB_RADIUS } from "../constants/dockOrb";

interface DockMicButtonProps {
  onClick: () => void;
  /** `false`면 독이 녹음 파형으로 접혀 있어 구슬을 그리지 않아요. 자리는 그대로 차지해요 */
  isOrbVisible?: boolean;
  /** 눌러서 녹음이 열리기를 기다리는 중. 구슬이 밝은 구름으로 바뀌어 빠르게 돌고, 다시 눌러도 반응하지 않아요 */
  isWaiting?: boolean;
}

/**
 * 독의 회의 녹음 버튼.
 *
 * 평소엔 고리 안에 붉은 원이 든 녹음 버튼이에요. 올리거나 포커스하면 원이 입자로 살짝 분해됐다가 마이크 모양으로 모이고,
 * 벗어나면 다시 원으로 돌아와요. 누르면 파동이 한 번 퍼진 뒤 녹음을 시작해요.
 * 녹음이 열리기를 기다리는 동안은 구슬이 바로 밝은 구름으로 바뀌어 빠르게 돌고, 그 둘레를 입자 점 고리와 밝은 호가 돌아요.
 * 고리는 CSS 회전이라 마이크 권한이나 서버를 기다리며 메인 스레드가 잠시 막혀도 멈추지 않아, 렉이 아니라 기다리는 중으로 보여요.
 * 40px 칸을 차지하고 접근성 이름은 「회의 녹음 시작」이에요. 기다리는 동안은 `aria-busy`로 알려요.
 */
export default function DockMicButton({ onClick, isOrbVisible = true, isWaiting = false }: DockMicButtonProps) {
  const orbRef = useRef<ParticleOrbHandle>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleClick = () => {
    if (isWaiting) return;
    orbRef.current?.pulse();
    onClick();
  };

  // 올리는 순간 원을 입자로 흩뜨려야 마이크로 모이는 것이 「분해됐다 모인다」로 보여요
  const handleEnter = () => {
    if (!isWaiting) orbRef.current?.scatter();
  };

  return (
    <Button
      type="button"
      aria-label="회의 녹음 시작"
      data-mic
      aria-busy={isWaiting}
      onClick={handleClick}
      onPointerEnter={() => {
        handleEnter();
        setIsHovered(true);
      }}
      onPointerLeave={() => setIsHovered(false)}
      onFocus={() => {
        handleEnter();
        setIsFocused(true);
      }}
      onBlur={() => setIsFocused(false)}
    >
      {isOrbVisible && isWaiting && (
        <WaitingRing viewBox="0 0 40 40" aria-hidden="true">
          {/* 입자처럼 끊어진 점 고리. 그 위를 밝은 호 하나가 한 바퀴씩 돌아요 */}
          <circle className="dots" cx="20" cy="20" r="17" />
          <circle className="arc" cx="20" cy="20" r="17" />
        </WaitingRing>
      )}
      {isOrbVisible && (
        <OrbWrapper>
          <ParticleOrb
            ref={orbRef}
            radius={DOCK_ORB_RADIUS}
            size={DOCK_ORB_CANVAS_SIZE}
            tone={isWaiting ? "neutral" : "idle"}
            shape={isWaiting ? "cloud" : isHovered || isFocused ? "mic" : "disc"}
            isWaiting={isWaiting}
          />
        </OrbWrapper>
      )}
    </Button>
  );
}

const Button = styled.button`
  position: relative;
  display: flex;
  align-self: center;
  align-items: center;
  justify-content: center;
  width: 2.5rem; /* 40px */
  height: 2.5rem;
  flex-shrink: 0;
  border-radius: 1.25rem; /* 20px */

  &[aria-busy="true"] {
    cursor: progress;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 2px;
  }
`;

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

/**
 * 기다리는 동안 버튼 둘레를 도는 점 고리와 밝은 호. 입자와 같은 밝은 회색이에요.
 * `transform` 애니메이션이라 메인 스레드가 막혀도 합성기에서 계속 돌아요. 움직임 줄이기 설정이면 돌지 않고 고리만 보여요
 */
const WaitingRing = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  animation: ${spin} 1.1s linear infinite;
  will-change: transform;

  & > .dots {
    fill: none;
    stroke: ${({ theme }) => theme.neutral[300]};
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-dasharray: 0.1 4.4; /* 끊어진 점으로 그려 입자 느낌이에요 */
    opacity: 0.55;
  }

  & > .arc {
    fill: none;
    stroke: ${({ theme }) => theme.neutral[0]};
    stroke-width: 2;
    stroke-linecap: round;
    stroke-dasharray: 26 81; /* 둘레(약 107) 중 26만큼만 밝은 호 */
    opacity: 0.95;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/** 캔버스가 버튼보다 커서 가운데에 맞춰 겹쳐 둬요 */
const OrbWrapper = styled.span`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
`;
