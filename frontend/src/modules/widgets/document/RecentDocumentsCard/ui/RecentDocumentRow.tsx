import styled from "@emotion/styled";
import Chip from "@primitives/ui/Chip";
import LinkTo from "@primitives/ui/LinkTo";
import { formatDate } from "@utils/formatDate";
import { formatDurationFromSeconds } from "@utils/formatDurationFromSeconds";

interface RecentDocumentRowProps {
  /** 행을 누르면 갈 문서 보기 주소 */
  href: string;
  title: string;
  /** 문서 생성 시각(ISO 8601) */
  createdAt: string;
  /** 녹음 길이(초) */
  recordingDurationSeconds: number;
}

/**
 * 최근 추가된 문서 카드의 행 하나. 제목 아래에 만든 날짜와 녹음 길이를 보여주고, 누르면 그 문서 보기로 가요.
 */
export default function RecentDocumentRow({
  href,
  title,
  createdAt,
  recordingDurationSeconds,
}: RecentDocumentRowProps) {
  return (
    <li>
      <RowLink href={href}>
        <Title>{title}</Title>
        <Meta>
          <CreatedDate dateTime={createdAt}>
            {formatDate(createdAt)}
          </CreatedDate>
          <Chip>{formatDurationFromSeconds(recordingDurationSeconds)}</Chip>
        </Meta>
      </RowLink>
    </li>
  );
}

/** 피그마 DocRow: 위아래 안쪽 여백 8px, 제목과 날짜 줄 사이 2px */
const RowLink = styled(LinkTo)`
  display: flex;
  flex-direction: column;
  gap: 0.125rem; /* 2px */
  padding: 0.5rem 0; /* 8px 0 */
  border-radius: 0.5rem; /* 8px */

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 2px;
  }
`;

const Title = styled.p`
  ${({ theme }) => theme.text.body01};
  overflow: hidden;
  color: ${({ theme }) => theme.neutral[900]};
  white-space: nowrap;
  text-overflow: ellipsis;
`;

/** 피그마 Meta: 날짜와 녹음 길이 칩 사이 8px */
const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem; /* 8px */
`;

const CreatedDate = styled.time`
  ${({ theme }) => theme.text.caption01};
  color: ${({ theme }) => theme.neutral[500]};
`;
