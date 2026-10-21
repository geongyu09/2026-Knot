import ParticleOrb from "@composites/ParticleOrb";
import styled from "@emotion/styled";
import { useState } from "react";

import { DOCK_ORB_CANVAS_SIZE, DOCK_ORB_RADIUS } from "../constants/dockOrb";

interface DockChatButtonProps {
  onClick: () => void;
  /** `false`면 독이 입자 스케치 상태라 그리지 않아요. 자리는 그대로 차지해요 */
  isOrbVisible?: boolean;
}

/**
 * 접힌 독의 채팅 버튼.
 *
 * 녹음 버튼과 같은 입자 구슬 방식이에요. 입자가 점 세 개가 든 말풍선으로 모여 있고, 올리거나 포커스하면
 * 점들이 입력 중처럼 차례로 튀어요. 누르면 질문 입력창으로 펼쳐져요. 접근성 이름은 「무엇이든 요청하기」예요.
 */
export default function DockChatButton({ onClick, isOrbVisible = true }: DockChatButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Button
      type="button"
      aria-label="무엇이든 요청하기"
      data-dock-chat
      onClick={onClick}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      {isOrbVisible && (
        <OrbWrapper>
          <ParticleOrb
            radius={DOCK_ORB_RADIUS}
            size={DOCK_ORB_CANVAS_SIZE}
            tone="neutral"
            shape={isHovered || isFocused ? "typing" : "bubble"}
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
