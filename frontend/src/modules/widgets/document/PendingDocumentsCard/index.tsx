import usePendingDocumentsQuery from "@api/queries/usePendingDocumentsQuery";
import styled from "@emotion/styled";
import useNavigateToDocument from "@hooks/domain/document/useNavigateToDocument";

import { useTitleId } from "./model/useTitleId";
import { useWorkspaceId } from "./model/useWorkspaceId";
import PendingDocumentRow from "./ui/PendingDocumentRow";

/**
 * 홈의 「확인이 필요한 문서」 카드. 워크스페이스에서 내가 아직 확인하지 않은 문서를 모두 보여주고, 행의 「확인하기」를 누르면 그 문서 보기로 가요.
 *
 * 카드에서 바로 확인하지는 않아요. 확인은 문서 보기에서 문서를 읽고 해요.
 *
 * 문서가 많아도 카드의 높이는 그대로예요. 제목 줄은 그 자리에 두고 행만 카드 안에서 스크롤해요.
 *
 * 주소의 워크스페이스 id는 숫자인지 확인하지 않고 그대로 요청해요. 잘못된 주소인지는 서버가 판단해요.
 */
export default function PendingDocumentsCard() {
  const { titleId } = useTitleId();
  const { workspaceId } = useWorkspaceId();
  const { data: pendingDocuments } = usePendingDocumentsQuery({ workspaceId });
  const { navigateToDocument } = useNavigateToDocument();

  // 행을 세지 않고 서버가 센 주제별 문서 수를 더해요. 문서가 아주 많아 다 받지 못해도 맞는 수가 보여요
  const pendingCount = pendingDocuments?.topics.reduce(
    (count, { documentCount }) => count + documentCount,
    0,
  );

  return (
    <Container aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>확인이 필요한 문서</Title>
        {pendingCount !== undefined && <Count>{pendingCount}</Count>}
      </Header>
      {pendingDocuments !== undefined && (
        <RowList>
          {pendingDocuments.items.map(({ id, title, createdAt }) => (
            <PendingDocumentRow
              key={id}
              title={title}
              createdAt={createdAt}
              onOpenDocument={() =>
                navigateToDocument({ workspaceId, documentId: id })
              }
            />
          ))}
        </RowList>
      )}
    </Container>
  );
}

/** 피그마 Card/ConfirmRequests: 652x312 고정, 안쪽 여백 20px, 머리와 행 사이 8px */
const Container = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
  width: 40.75rem; /* 652px */
  max-width: 100%;
  height: 19.5rem; /* 312px */
  overflow: hidden;
  padding: 1.25rem; /* 20px */
  border-radius: 1.5rem; /* 24px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow02};
`;

/** 피그마 Header: 좌우 4px · 아래 8px, 제목과 문서 수 사이 8px */
const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem; /* 8px */
  padding: 0 0.25rem 0.5rem; /* 0 4px 8px */
`;

const Title = styled.h2`
  color: ${({ theme }) => theme.neutral[900]};
  ${({ theme }) => theme.text.label01};
`;

const Count = styled.span`
  color: ${({ theme }) => theme.neutral[500]};
  ${({ theme }) => theme.text.label01};
`;

/** 피그마 Card/ConfirmRequests: 행 사이 8px. 행이 카드 높이를 넘으면 카드를 키우지 않고 이 안에서만 스크롤해요 */
const RowList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
  overflow-y: auto;
`;
