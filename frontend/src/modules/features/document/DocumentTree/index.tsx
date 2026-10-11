import useDocumentsQuery from "@api/queries/useDocumentsQuery";
import styled from "@emotion/styled";
import { getRouterPath } from "@routes/PATH_ROUTE";
import { groupDocumentsByTopic } from "@utils/groupDocumentsByTopic";

import { useCurrentDocumentId } from "./model/useCurrentDocumentId";
import { useFolderExpansion } from "./model/useFolderExpansion";
import { useLabelId } from "./model/useLabelId";
import { useWorkspaceId } from "./model/useWorkspaceId";
import DocumentTreeFolder from "./ui/DocumentTreeFolder";
import DocumentTreeRow from "./ui/DocumentTreeRow";

/**
 * 사이드바의 문서 목록. 워크스페이스의 문서를 폴더(주제)별로 접어 보여주고, 문서를 누르면 그 문서 보기로 가요.
 *
 * 폴더는 이름순, 폴더 안의 문서는 최신순이에요. 문서 목록 화면(`DocumentList`)과 같은 조회 · 같은 묶기를 써서 두 곳의 순서와 문서 수가 같아요.
 *
 * 지금 보는 문서의 폴더만 펼친 채로 시작해요. 사용자가 누른 폴더는 누른 대로 두고, 그 기록은 이 목록이 화면에 있는 동안만 남아요.
 */
export default function DocumentTree() {
  const { labelId } = useLabelId();
  const { workspaceId } = useWorkspaceId();
  const { currentDocumentId } = useCurrentDocumentId();
  const { data: documentList } = useDocumentsQuery({ workspaceId });

  const currentTopic = documentList?.items.find(
    ({ id }) => id === currentDocumentId,
  )?.topic;
  const { isFolderExpanded, toggleFolder } = useFolderExpansion({
    currentTopic,
  });

  if (documentList === undefined) return null;

  const folders = groupDocumentsByTopic({
    topics: documentList.topics,
    documents: documentList.items,
  });

  return (
    <Container aria-labelledby={labelId}>
      <Label id={labelId}>문서</Label>
      <Folders>
        {folders.map(({ topic, documentCount, documents }) => (
          <DocumentTreeFolder
            key={topic}
            topic={topic}
            documentCount={documentCount}
            isExpanded={isFolderExpanded(topic)}
            onToggle={() => toggleFolder(topic)}
          >
            {documents.map(({ id, title }) => (
              <DocumentTreeRow
                key={id}
                href={getRouterPath({
                  routeKey: "DOCUMENT",
                  params: {
                    workspaceId: String(workspaceId),
                    documentId: String(id),
                  },
                })}
                title={title}
                isCurrent={id === currentDocumentId}
              />
            ))}
          </DocumentTreeFolder>
        ))}
      </Folders>
    </Container>
  );
}

/** 피그마 Sidebar/Docs: 머리말과 폴더 묶음 사이 12px */
const Container = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* 12px */
`;

/** 피그마 FolderHead: 안쪽 여백 왼쪽 10px · 오른쪽 8px */
const Label = styled.span`
  ${({ theme }) => theme.text.caption01};
  padding: 0 0.5rem 0 0.625rem; /* 0 8px 0 10px */
  color: ${({ theme }) => theme.neutral[600]};
`;

/** 피그마 DocTree: 폴더 사이 8px */
const Folders = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
`;
