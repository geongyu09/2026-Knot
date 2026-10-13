import styled from "@emotion/styled";
import Button from "@primitives/ui/Button";
import { formatDate } from "@utils/formatDate";

interface PendingDocumentRowProps {
  title: string;
  /** 문서 생성 시각(ISO 8601) */
  createdAt: string;
  /** 「확인하기」를 눌렀을 때 실행할 동작 */
  onOpenDocument: () => void;
}

/**
 * 확인이 필요한 문서 카드의 행 하나. 제목 아래에 만든 날짜를, 오른쪽에 「확인하기」 버튼을 보여줘요.
 */
export default function PendingDocumentRow({
  title,
  createdAt,
  onOpenDocument,
}: PendingDocumentRowProps) {
  return (
    <Container>
      <Info>
        <Title>{title}</Title>
        <CreatedDate dateTime={createdAt}>{formatDate(createdAt)}</CreatedDate>
      </Info>
      <Button size="sm" variant="outline" onClick={onOpenDocument}>
        확인하기
      </Button>
    </Container>
  );
}

/** 피그마 ConfirmRow: 위아래 8px · 좌우 12px, 모서리 16px, 글과 버튼 사이 16px */
const Container = styled.li`
  display: flex;
  align-items: center;
  gap: 1rem; /* 16px */
  padding: 0.5rem 0.75rem; /* 8px 12px */
  border-radius: 1rem; /* 16px */
`;

/** 피그마 Text: 제목과 날짜 사이 2px. 긴 제목이 버튼을 밀어내지 않게 남은 폭만 써요 */
const Info = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem; /* 2px */
  min-width: 0;
`;

const Title = styled.p`
  ${({ theme }) => theme.text.label01};
  overflow: hidden;
  color: ${({ theme }) => theme.neutral[900]};
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const CreatedDate = styled.time`
  ${({ theme }) => theme.text.caption02};
  color: ${({ theme }) => theme.neutral[600]};
`;
