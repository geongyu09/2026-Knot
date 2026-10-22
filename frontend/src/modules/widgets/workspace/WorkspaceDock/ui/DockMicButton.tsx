import ParticleOrb, { type ParticleOrbHandle } from "@composites/ParticleOrb";
import styled from "@emotion/styled";
import { useRef, useState } from "react";

import { DOCK_ORB_CANVAS_SIZE, DOCK_ORB_RADIUS } from "../constants/dockOrb";

interface DockMicButtonProps {
  onClick: () => void;
  /** `false`면 독이 녹음 파형으로 접혀 있어 구슬을 그리지 않아요. 자리는 그대로 차지해요 */
  isOrbVisible?: boolean;
  /** 눌러서 녹음이 열리기를 기다리는 중. 구슬이 녹음 중의 청록으로 바뀌어 빠르게 돌고, 다시 눌러도 반응하지 않아요 */
  isWaiting?: boolean;
}

/**
 * 독의 회의 녹음 버튼.
 *
 * 마이크 아이콘 대신 랜딩의 입자 구슬이에요. 올리거나 포커스하면 입자가 마이크 모양으로 모이고,
 * 누르면 파동이 한 번 퍼진 뒤 녹음을 시작해요. 녹음이 열리기를 기다리는 동안은 구슬이 바로 청록으로 바뀌어 빠르게 돌아,
 * 마이크 권한과 서버를 기다리는 1~2초에도 누른 것이 받아들여졌다는 것이 보여요.
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

  return (
    <Button
      type="button"
      aria-label="회의 녹음 시작"
      data-mic
      aria-busy={isWaiting}
      onClick={handleClick}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      {isOrbVisible && (
        <OrbWrapper>
          <ParticleOrb
            ref={orbRef}
            radius={DOCK_ORB_RADIUS}
            size={DOCK_ORB_CANVAS_SIZE}
            tone={isWaiting ? "recording" : "idle"}
            shape={!isWaiting && (isHovered || isFocused) ? "mic" : "cloud"}
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

/** 캔버스가 버튼보다 커서 가운데에 맞춰 겹쳐 둬요 */
const OrbWrapper = styled.span`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
`;
