import useWorkspaceQuery from "@api/queries/useWorkspaceQuery";
import styled from "@emotion/styled";
import DocumentTree from "@features/document/DocumentTree";
import Avatar from "@primitives/ui/Avatar";

import { useParams } from "react-router";

/**
 * 워크스페이스 사이드바 드로어. 워크스페이스 이름과 문서 목록(`DocumentTree`)을 보여줘요.
 */
export default function WorkspaceSidebar() {
  const { workspaceId } = useParams();
  // 레이아웃의 진입 판정과 같은 쿼리라 요청은 한 번만 나가요
  const { data: workspace } = useWorkspaceQuery({
    workspaceId: Number(workspaceId),
  });

  const workspaceName = workspace?.name ?? "";

  return (
    <Container aria-label="워크스페이스 사이드바">
      <WorkspaceHeader>
        <WorkspaceInfo>
          <Avatar
            label={workspaceName || "워크스페이스"}
            name={workspaceName}
            size={24}
          />
          <WorkspaceName>{workspaceName}</WorkspaceName>
        </WorkspaceInfo>
      </WorkspaceHeader>

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

const WorkspaceHeader = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  height: 2.5rem; /* 40px */
  padding: 0 0.5rem; /* 8px */
  color: ${({ theme }) => theme.neutral[400]};
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
