import styled from "@emotion/styled";
import DocumentTree from "@features/document/DocumentTree";
import WorkspaceSwitcher from "@features/workspace/WorkspaceSwitcher";

/**
 * 워크스페이스 사이드바 드로어. 워크스페이스 이름과 문서 목록(`DocumentTree`)을 보여줘요.
 *
 * 맨 위의 워크스페이스 이름(`WorkspaceSwitcher`)을 누르면 다른 워크스페이스로 옮겨 가거나 새로 만들 수 있어요.
 */
export default function WorkspaceSidebar() {
  return (
    <Container aria-label="워크스페이스 사이드바">
      <WorkspaceSwitcher />

      <DocumentTree />
    </Container>
  );
}

const Container = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* 12px */
  width: 17.5rem; /* 280px */
  height: 100%;
  padding: 1rem; /* 16px */
  border: 1px solid ${({ theme }) => theme.neutral[200]};
  border-radius: 1.5rem; /* 24px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow03};
  overflow-y: auto;
`;
