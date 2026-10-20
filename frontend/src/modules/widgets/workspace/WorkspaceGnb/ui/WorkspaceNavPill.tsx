import {
  TAB_ENTER_EASING,
  TAB_INDICATOR_DURATION,
  TAB_POP_EASING,
  TAB_PRESS_DURATION,
  TAB_PRESS_SCALE,
  TAB_RELEASE_DURATION,
} from "@constants/tabMotion";
import styled from "@emotion/styled";
import useWorkspaceNav from "@hooks/domain/workspace/useWorkspaceNav";

import { useNavIndicator } from "../model/useNavIndicator";

/**
 * GNB 가운데의 내비 필. 홈 · 탐색 · 문서를 오가고 지금 화면을 채워진 모양으로 알려줘요.
 *
 * 채워진 모양은 칸마다 따로 칠하지 않고 진한 표시 하나가 칸 사이를 미끄러져요.
 * 칸마다 따로 바꾸면 바뀌는 동안 두 칸이 함께 반쯤 어두워 보여서예요.
 * 누르는 동안 칸이 살짝 작아졌다가 떼면 통 튀어 돌아와요. 지금 탭을 누르면 이 눌림만 보이고 화면은 그대로예요.
 * 움직임 줄이기를 켜 두면 눌림과 미끄러짐 없이 바로 바뀌어요.
 */
export default function WorkspaceNavPill() {
  const {
    isHomeActive,
    isChatActive,
    isDocumentsActive,
    activeTabIndex,
    navigateToHome,
    navigateToExplore,
    navigateToDocuments,
  } = useWorkspaceNav();
  const { containerRef, indicatorRef } = useNavIndicator({ activeTabIndex });

  return (
    <Container ref={containerRef} aria-label="워크스페이스 화면 이동">
      <Indicator
        ref={indicatorRef}
        aria-hidden="true"
        hidden={activeTabIndex === -1}
      />
      <NavItem
        type="button"
        aria-current={isHomeActive ? "page" : undefined}
        $isActive={isHomeActive}
        onClick={navigateToHome}
      >
        홈
      </NavItem>
      <NavItem
        type="button"
        aria-current={isChatActive ? "page" : undefined}
        $isActive={isChatActive}
        onClick={navigateToExplore}
      >
        탐색
      </NavItem>
      <NavItem
        type="button"
        aria-current={isDocumentsActive ? "page" : undefined}
        $isActive={isDocumentsActive}
        onClick={navigateToDocuments}
      >
        문서
      </NavItem>
    </Container>
  );
}

const Container = styled.nav`
  position: relative; /* 표시가 이 자리를 기준으로 칸 아래에 놓여요 */
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.125rem; /* 2px */
  height: 2.75rem; /* 44px */
  padding: 0.375rem; /* 6px */
  border: 1px solid ${({ theme }) => theme.neutral[200]};
  border-radius: 62.4375rem; /* 999px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow02};
`;

/**
 * 지금 탭 칸 아래에 깔리는 진한 표시. 자리와 크기는 `useNavIndicator`가 칸을 재서 정해요.
 *
 * 탭이 바뀔 때만(`data-sliding="true"`) 미끄러지고, 처음 놓이거나 칸 크기가 바뀌면 바로 그 자리에 놓여요.
 * 지금 탭 칸을 누르면 칸과 함께 작아져요. 다른 칸을 누를 때는 그 칸의 글자만 작아져요.
 */
const Indicator = styled.span`
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 62.4375rem;
  background-color: ${({ theme }) => theme.neutral[700]};
  pointer-events: none;

  @media (prefers-reduced-motion: no-preference) {
    transition-property: transform, width, scale;
    transition-duration: 0s, 0s, ${TAB_RELEASE_DURATION};
    transition-timing-function:
      ${TAB_ENTER_EASING}, ${TAB_ENTER_EASING}, ${TAB_POP_EASING};

    &[data-sliding="true"] {
      transition-duration:
        ${TAB_INDICATOR_DURATION}, ${TAB_INDICATOR_DURATION},
        ${TAB_RELEASE_DURATION};
    }

    nav:has(> [aria-current="page"]:active) > & {
      scale: ${TAB_PRESS_SCALE};
      transition-duration:
        ${TAB_INDICATOR_DURATION}, ${TAB_INDICATOR_DURATION},
        ${TAB_PRESS_DURATION};
      transition-timing-function:
        ${TAB_ENTER_EASING}, ${TAB_ENTER_EASING}, ${TAB_ENTER_EASING};
    }
  }
`;

const NavItem = styled.button<{ $isActive: boolean }>`
  position: relative; /* 먼저 놓인 표시보다 위에 글자를 그려요 */
  display: flex;
  align-items: center;
  height: 2rem; /* 32px */
  padding: 0 1.125rem; /* 18px */
  border-radius: 62.4375rem;
  color: ${({ theme, $isActive }) =>
    $isActive ? theme.neutral[0] : theme.neutral[600]};
  white-space: nowrap;
  ${({ theme }) => theme.text.caption02};

  /* 글자색은 표시가 지나가는 동안 같은 시간에 바꿔요 */
  @media (prefers-reduced-motion: no-preference) {
    transition-property: color, transform;
    transition-duration: ${TAB_INDICATOR_DURATION}, ${TAB_RELEASE_DURATION};
    transition-timing-function: ${TAB_ENTER_EASING}, ${TAB_POP_EASING};

    &:active {
      transform: scale(${TAB_PRESS_SCALE});
      transition-duration: ${TAB_INDICATOR_DURATION}, ${TAB_PRESS_DURATION};
      transition-timing-function: ${TAB_ENTER_EASING}, ${TAB_ENTER_EASING};
    }
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 2px;
  }
`;
