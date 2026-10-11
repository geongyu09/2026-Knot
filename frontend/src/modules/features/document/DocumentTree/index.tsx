import useDocumentsQuery from "@api/queries/useDocumentsQuery";
import styled from "@emotion/styled";
import useWorkspaceAccessGuard from "@hooks/domain/workspace/useWorkspaceAccessGuard";
import { getRouterPath } from "@routes/PATH_ROUTE";
import { groupDocumentsByTopic } from "@utils/groupDocumentsByTopic";

import { useCurrentDocumentId } from "./model/useCurrentDocumentId";
import { useFolderExpansion } from "./model/useFolderExpansion";
import { useLabelId } from "./model/useLabelId";
import { useWorkspaceId } from "./model/useWorkspaceId";
import DocumentTreeEmpty from "./ui/DocumentTreeEmpty";
import DocumentTreeFolder from "./ui/DocumentTreeFolder";
import DocumentTreeLoadFailed from "./ui/DocumentTreeLoadFailed";
import DocumentTreeRow from "./ui/DocumentTreeRow";
import DocumentTreeSkeleton from "./ui/DocumentTreeSkeleton";

/**
 * 사이드바의 문서 목록. 워크스페이스의 문서를 폴더(주제)별로 접어 보여주고, 문서를 누르면 그 문서 보기로 가요.
 *
 * 폴더는 이름순, 폴더 안의 문서는 최신순이에요. 문서 목록 화면(`DocumentList`)과 같은 조회 · 같은 묶기를 써서 두 곳의 순서와 문서 수가 같아요.
 *
 * 지금 보는 문서의 폴더만 펼친 채로 시작해요. 사용자가 누른 폴더는 누른 대로 두고, 그 기록은 이 목록이 화면에 있는 동안만 남아요.
 *
 * 문서를 받지 못한 동안에는 상태 화면이 목록 전체를 대신 그려요.
 * - 불러오는 중: `DocumentTreeSkeleton`. 401 · 403 · 404로 다른 화면에 보내는 동안에도 이 화면이에요.
 * - 불러오기 실패: `DocumentTreeLoadFailed`. 「다시 시도」는 문서 목록만 다시 받아요.
 * - 문서 없음: `DocumentTreeEmpty`.
 *
 * 문서를 한 번 받은 뒤에는 다시 불러오기가 실패해도 받은 목록을 계속 보여줘요.
 */
export default function DocumentTree() {
  const { labelId } = useLabelId();
  const { workspaceId } = useWorkspaceId();
  const { currentDocumentId } = useCurrentDocumentId();
  const {
    data: documentList,
    error,
    isError,
    refetch,
  } = useDocumentsQuery({ workspaceId });

  // 로그인이 풀렸으면 로그인 화면으로, 워크스페이스에 들어갈 수 없으면 선택 화면으로 보내요
  const { isRedirecting } = useWorkspaceAccessGuard({ error });

  const currentTopic = documentList?.items.find(
    ({ id }) => id === currentDocumentId,
  )?.topic;
  const { isFolderExpanded, toggleFolder } = useFolderExpansion({
    currentTopic,
  });

  // 화면을 새로고침하지 않고 목록만 다시 조회해요. 새로고침하면 브라우저 안에만 있는 진행 중인 녹음이 사라져요
  const handleRetry = () => {
    refetch();
  };

  // 받은 문서가 없고 실패했을 때 실패 안내를 보여줘요. 다른 화면으로 보내는 중이면 가는 동안 안내가 잠깐 보이지 않게 빼요
  const shouldShowLoadFailed =
    documentList === undefined && isError && !isRedirecting;

  if (shouldShowLoadFailed) {
    return <DocumentTreeLoadFailed onRetry={handleRetry} />;
  }

  if (documentList === undefined) {
    return <DocumentTreeSkeleton />;
  }

  const folders = groupDocumentsByTopic({
    topics: documentList.topics,
    documents: documentList.items,
  });

  if (folders.length === 0) return <DocumentTreeEmpty />;

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
