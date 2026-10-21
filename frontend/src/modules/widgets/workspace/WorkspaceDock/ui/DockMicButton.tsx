import ParticleOrb, { type ParticleOrbHandle } from "@composites/ParticleOrb";
import styled from "@emotion/styled";
import { useRef, useState } from "react";

/** 입자 구슬의 반지름과 캔버스 한 변(px). 캔버스는 40px 칸보다 커서 마이크 모양이 넉넉히 들어가요 */
const ORB_RADIUS = 12;
const ORB_CANVAS_SIZE = 56;

interface DockMicButtonProps {
  onClick: () => void;
}

/**
 * 독의 회의 녹음 버튼.
 *
 * 마이크 아이콘 대신 랜딩의 입자 구슬이에요. 올리거나 포커스하면 입자가 마이크 모양으로 모이고,
 * 누르면 파동이 한 번 퍼진 뒤 녹음을 시작해요. 40px 칸을 차지하고 접근성 이름은 「회의 녹음 시작」이에요.
 */
export default function DockMicButton({ onClick }: DockMicButtonProps) {
  const orbRef = useRef<ParticleOrbHandle>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleClick = () => {
    orbRef.current?.pulse();
    onClick();
  };

  return (
    <Button
      type="button"
      aria-label="회의 녹음 시작"
      data-mic
      onClick={handleClick}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      <OrbWrapper>
        <ParticleOrb
          ref={orbRef}
          radius={ORB_RADIUS}
          size={ORB_CANVAS_SIZE}
          shape={isHovered || isFocused ? "mic" : "cloud"}
        />
      </OrbWrapper>
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
