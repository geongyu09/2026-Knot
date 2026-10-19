import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

const unfoldIn = keyframes`
  from {
    opacity: 0;
    transform: scaleY(0.8);
  }
`;

const unfoldOut = keyframes`
  to {
    opacity: 0;
    transform: scaleY(0.8);
  }
`;

/**
 * 트리거 아래로 뜨는 메뉴나 팝오버가 위쪽 끝에서 세로로 펼쳐지며 나타나게 하는 애니메이션.
 *
 * 드롭다운, 팝오버처럼 트리거 아래에 띄우는 요소의 겉 요소로 써요. 띄우는 요소는 `styled(Unfold)`로 이어 받아 자기 모양을 더해요.
 * 띄운 쪽이 닫는 동안 이 요소나 감싼 요소에 `data-overlay-state="closing"`을 붙이면 다시 접히며 사라져요.
 * 움직임 줄이기 설정에서는 애니메이션 없이 바로 나타나고 사라져요.
 */
const Unfold = styled.div`
  transform-origin: top;
  animation: ${unfoldIn} 0.2s cubic-bezier(0.23, 1, 0.32, 1) forwards;

  &[data-overlay-state="closing"],
  [data-overlay-state="closing"] & {
    animation: ${unfoldOut} 0.25s cubic-bezier(0.755, 0.05, 0.855, 0.06)
      forwards;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    &[data-overlay-state="closing"],
    [data-overlay-state="closing"] & {
      animation: none;
    }
  }
`;

export default Unfold;
