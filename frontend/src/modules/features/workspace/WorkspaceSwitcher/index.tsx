import styled from "@emotion/styled";
import useExitAnimation from "@hooks/common/useExitAnimation";
import Avatar from "@primitives/ui/Avatar";

import ChevronDownIcon from "@/assets/icons/chevronDown.svg";

import { useWorkspaceSwitcher } from "./model/useWorkspaceSwitcher";
import WorkspaceMenu from "./ui/WorkspaceMenu";

/**
 * 지금 워크스페이스의 이름을 보여 주고, 누르면 다른 워크스페이스로 옮겨 가거나 새로 만들거나 나갈 수 있는 메뉴를 여는 버튼.
 *
 * 사이드바 맨 위에 둬요. 메뉴는 이름 바로 아래로 펼쳐지고, 감싸는 영역의 폭을 그대로 써요.
 * 닫힌 메뉴는 `useExitAnimation`이 접히는 애니메이션이 끝날 때까지 조금 더 그려 둬요.
 */
export default function WorkspaceSwitcher() {
  const {
    currentWorkspaceId,
    workspaceName,
    workspaces,
    menuId,
    menuAreaRef,
    isOpen,
    handleToggle,
    handleSelectWorkspace,
    handleCreateWorkspace,
    handleLeaveWorkspace,
  } = useWorkspaceSwitcher();
  const { renderedValue: isMenuRendered, isExiting: isMenuClosing } =
    useExitAnimation({ value: isOpen || null, ref: menuAreaRef });

  return (
    <Container ref={menuAreaRef}>
      <Trigger
        type="button"
        aria-label="워크스페이스 메뉴"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={handleToggle}
      >
        <WorkspaceInfo>
          <Avatar
            label={workspaceName || "워크스페이스"}
            name={workspaceName}
            size={24}
          />
          <WorkspaceName>{workspaceName}</WorkspaceName>
        </WorkspaceInfo>
        <ChevronDownIcon size={12} />
      </Trigger>

      {isMenuRendered && (
        <WorkspaceMenu
          id={menuId}
          workspaces={workspaces}
          currentWorkspaceId={currentWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
          onCreateWorkspace={handleCreateWorkspace}
          onLeaveWorkspace={handleLeaveWorkspace}
          isClosing={isMenuClosing}
        />
      )}
    </Container>
  );
}

/** 메뉴를 이름 바로 아래에 띄우는 기준이에요 */
const Container = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const Trigger = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem; /* 8px */
  width: 100%;
  height: 2.5rem; /* 40px */
  padding: 0 0.5rem; /* 8px */
  border-radius: 0.5rem; /* 8px */
  color: ${({ theme }) => theme.neutral[400]};
  text-align: left;
  transition: background-color 0.2s ease-in;

  &:hover,
  &:focus-visible {
    background-color: ${({ theme }) => theme.neutral[100]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: -2px;
  }

  & > svg {
    flex-shrink: 0;
  }
`;

const WorkspaceInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem; /* 10px */
  min-width: 0;
`;

const WorkspaceName = styled.span`
  overflow: hidden;
  color: ${({ theme }) => theme.neutral[900]};
  white-space: nowrap;
  text-overflow: ellipsis;
  ${({ theme }) => theme.text.label01};
`;
