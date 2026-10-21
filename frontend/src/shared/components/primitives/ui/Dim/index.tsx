import { keyframes } from "@emotion/react";
import { MEDIA_QUERY } from "@constants/breakpoint";
import styled from "@emotion/styled";

const dimShow = keyframes`
  from {
    opacity: 0;
  }
`;

const dimHide = keyframes`
  to {
    opacity: 0;
  }
`;

/**
 * 모달 뒤를 덮는 배경 막(스크림).
 *
 * 나타날 때 서서히 짙어지고, 띄운 쪽이 닫는 동안 감싼 요소에 `data-overlay-state="closing"`을 붙이면 옅어지며 사라져요.
 * 위에 올린 내용이 어떻게 움직일지는 내용 쪽이 정해요. 예: 모달 카드는 `Pop`
 * 움직임 줄이기 설정에서는 애니메이션 없이 바로 나타나고 사라져요.
 * 모바일에서는 위에 올린 창이 화면 아래에 붙는 시트가 되도록 아래로 모으고 여백을 없애요(RESP-R7).
 */
const Dim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 30; /* 겹쳐 뜨는 패널(20)보다 위 */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem; /* 16px — 좁은 화면에서도 가장자리에 붙지 않아요 */
  background-color: ${({ theme }) => `${theme.neutral[900]}66`}; /* 40% */
  animation: ${dimShow} 0.4s ease;

  [data-overlay-state="closing"] & {
    animation: ${dimHide} 0.2s ease-in-out forwards;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    [data-overlay-state="closing"] & {
      animation: none;
    }
  }

  ${MEDIA_QUERY.mobile} {
    align-items: flex-end;
    padding: 0;
  }
`;

export default Dim;
