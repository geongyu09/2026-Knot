import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

// 살짝 커졌다가(1.02) 제자리로 내려앉아요
const popIn = keyframes`
  0% {
    opacity: 0;
    transform: translateY(2%) scale(0.95);
  }
  40% {
    opacity: 1;
    transform: translateY(-1%) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: none;
  }
`;

const popOut = keyframes`
  to {
    opacity: 0;
    transform: translateY(2%) scale(0.96);
  }
`;

/**
 * 화면 가운데 뜨는 카드가 살짝 튀어 오르며 나타나게 하는 애니메이션.
 *
 * 모달 카드처럼 가운데 띄우는 요소의 겉 요소로 써요. 카드는 `styled(Pop)`으로 이어 받아 자기 모양을 더해요.
 * 띄운 쪽이 닫는 동안 이 요소나 감싼 요소에 `data-overlay-state="closing"`을 붙이면 옅어지며 사라져요.
 * 움직임 줄이기 설정에서는 애니메이션 없이 바로 나타나고 사라져요.
 */
const Pop = styled.div`
  animation: ${popIn} 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;

  &[data-overlay-state="closing"],
  [data-overlay-state="closing"] & {
    animation: ${popOut} 0.2s ease-in-out forwards;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    &[data-overlay-state="closing"],
    [data-overlay-state="closing"] & {
      animation: none;
    }
  }
`;

export default Pop;
