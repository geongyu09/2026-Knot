import useRecentDocumentsQuery from "@api/queries/useRecentDocumentsQuery";
import styled from "@emotion/styled";
import useWorkspaceAccessGuard from "@hooks/domain/workspace/useWorkspaceAccessGuard";
import { getRouterPath } from "@routes/PATH_ROUTE";

import { useTitleId } from "./model/useTitleId";
import { useWorkspaceId } from "./model/useWorkspaceId";
import RecentDocumentRow from "./ui/RecentDocumentRow";
import RecentDocumentsEmpty from "./ui/RecentDocumentsEmpty";
import RecentDocumentsLoadFailed from "./ui/RecentDocumentsLoadFailed";
import RecentDocumentsSkeleton from "./ui/RecentDocumentsSkeleton";
import ViewAllLink from "./ui/ViewAllLink";

/**
 * 홈의 「최근 추가된 문서」 카드. 워크스페이스에서 가장 최근에 만들어진 문서를 3개까지 보여주고, 행을 누르면 그 문서 보기로 가요.
 *
 * 「전체 보기」는 문서 목록으로 가요.
 *
 * 문서를 받지 못한 동안에는 상태 화면이 카드 전체를 대신 그려요.
 * - 불러오는 중: `RecentDocumentsSkeleton`. 401 · 403 · 404로 다른 화면에 보내는 동안에도 이 화면이에요.
 * - 불러오기 실패: `RecentDocumentsLoadFailed`. 「다시 시도」는 이 카드의 문서만 다시 받아요.
 * - 문서 없음: `RecentDocumentsEmpty`.
 *
 * 문서를 한 번 받은 뒤에는 다시 불러오기만 실패해도 받은 문서를 계속 보여줘요.
 *
 * 주소의 워크스페이스 id는 숫자인지 확인하지 않고 그대로 요청해요. 잘못된 주소인지는 서버가 판단해요.
 */
export default function RecentDocumentsCard() {
  const { titleId } = useTitleId();
  const { workspaceId } = useWorkspaceId();
  const {
    data: recentDocuments,
    error,
    isError,
    refetch,
  } = useRecentDocumentsQuery({ workspaceId });

  // 로그인이 풀렸으면 로그인 화면으로, 워크스페이스에 들어갈 수 없으면 마지막으로 본 다른 워크스페이스나 선택 화면으로 보내고 알려요
  const { isRedirecting } = useWorkspaceAccessGuard({ error });

  // 화면을 새로고침하지 않고 이 카드의 문서만 다시 조회해요. 새로고침하면 브라우저 안에만 있는 진행 중인 녹음이 사라져요
  const handleRetry = () => {
    refetch();
  };

  // 받은 문서가 없고 실패했을 때 실패 안내를 보여줘요. 다른 화면으로 보내는 중이면 가는 동안 안내가 잠깐 보이지 않게 빼요
  const shouldShowLoadFailed =
    recentDocuments === undefined && isError && !isRedirecting;

  if (shouldShowLoadFailed) {
    return <RecentDocumentsLoadFailed onRetry={handleRetry} />;
  }

  if (recentDocuments === undefined) {
    return <RecentDocumentsSkeleton />;
  }

  if (recentDocuments.items.length === 0) return <RecentDocumentsEmpty />;

  return (
    <Container aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>최근 추가된 문서</Title>
        <ViewAllLink />
      </Header>
      <Rows>
        {recentDocuments.items.map(
          ({ id, title, createdAt, recordingDurationSeconds }) => (
            <RecentDocumentRow
              key={id}
              href={getRouterPath({
                routeKey: "DOCUMENT",
                params: {
                  workspaceId: String(workspaceId),
                  documentId: String(id),
                },
              })}
              title={title}
              createdAt={createdAt}
              recordingDurationSeconds={recordingDurationSeconds}
            />
          ),
        )}
      </Rows>
    </Container>
  );
}

/** 피그마 Card/RecentDocs: 400x312 고정, 안쪽 여백 20px, 머리와 행 사이 14px */
const Container = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.875rem; /* 14px */
  width: 25rem; /* 400px */
  max-width: 100%;
  height: 19.5rem; /* 312px */
  overflow: hidden;
  padding: 1.25rem; /* 20px */
  border-radius: 1.5rem; /* 24px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow02};
`;

const Header = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  color: ${({ theme }) => theme.neutral[900]};
  ${({ theme }) => theme.text.label01};
`;

/** 피그마 Card/RecentDocs: 행 사이 14px */
const Rows = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.875rem; /* 14px */
`;
