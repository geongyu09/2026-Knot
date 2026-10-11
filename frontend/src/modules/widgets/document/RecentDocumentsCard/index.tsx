import useRecentDocumentsQuery from "@api/queries/useRecentDocumentsQuery";
import styled from "@emotion/styled";
import LinkTo from "@primitives/ui/LinkTo";
import { getRouterPath } from "@routes/PATH_ROUTE";

import ChevronRightIcon from "@/assets/icons/chevronRight.svg";

import { useTitleId } from "./model/useTitleId";
import { useWorkspaceId } from "./model/useWorkspaceId";
import RecentDocumentRow from "./ui/RecentDocumentRow";

/**
 * 홈의 「최근 추가된 문서」 카드. 워크스페이스에서 가장 최근에 만들어진 문서를 3개까지 보여주고, 행을 누르면 그 문서 보기로 가요.
 *
 * 「전체 보기」는 문서 목록으로 가요.
 *
 * 주소의 워크스페이스 id는 숫자인지 확인하지 않고 그대로 요청해요. 잘못된 주소인지는 서버가 판단해요.
 */
export default function RecentDocumentsCard() {
  const { titleId } = useTitleId();
  const { workspaceId } = useWorkspaceId();
  const { data: recentDocuments } = useRecentDocumentsQuery({ workspaceId });

  if (recentDocuments === undefined) return null;

  return (
    <Container aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>최근 추가된 문서</Title>
        <ViewAllLink
          href={getRouterPath({
            routeKey: "DOCUMENTS",
            params: { workspaceId: String(workspaceId) },
          })}
        >
          전체 보기
          <ChevronRightIcon size={12} aria-hidden />
        </ViewAllLink>
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

/** 피그마 「전체 보기」: 글자와 화살표 사이 4px */
const ViewAllLink = styled(LinkTo)`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem; /* 4px */
  border-radius: 0.25rem; /* 4px */
  color: ${({ theme }) => theme.neutral[600]};
  ${({ theme }) => theme.text.caption02};

  & > svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.neutral[500]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 2px;
  }
`;

/** 피그마 Card/RecentDocs: 행 사이 14px */
const Rows = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.875rem; /* 14px */
`;
