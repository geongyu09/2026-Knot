import styled from "@emotion/styled";
import LinkTo from "@primitives/ui/LinkTo";

interface DocumentTreeRowProps {
  /** 행을 누르면 갈 문서 보기 주소 */
  href: string;
  title: string;
  /** 지금 보는 문서인지 */
  isCurrent: boolean;
}

/**
 * 사이드바 문서 목록의 문서 행 하나. 제목을 한 줄로 보여주고, 누르면 그 문서 보기로 가요.
 * 지금 보는 문서는 배경으로 표시해요.
 */
export default function DocumentTreeRow({
  href,
  title,
  isCurrent,
}: DocumentTreeRowProps) {
  return (
    <li>
      <RowLink href={href} aria-current={isCurrent ? "page" : undefined}>
        <Title>{title}</Title>
      </RowLink>
    </li>
  );
}

/**
 * 피그마 Doc: 높이 32px, 모서리 8px, 안쪽 여백 왼쪽 8px · 오른쪽 10px.
 * 지금 보는 문서는 Neutral/200 배경에 Neutral/900 글자예요
 */
const RowLink = styled(LinkTo)`
  display: flex;
  align-items: center;
  height: 2rem; /* 32px */
  padding: 0 0.625rem 0 0.5rem; /* 0 10px 0 8px */
  border-radius: 0.5rem; /* 8px */
  color: ${({ theme }) => theme.neutral[800]};
  transition: background-color 0.2s ease-in;

  &:hover {
    background-color: ${({ theme }) => theme.neutral[100]};
  }

  &[aria-current="page"] {
    background-color: ${({ theme }) => theme.neutral[200]};
    color: ${({ theme }) => theme.neutral[900]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: -2px;
  }
`;

const Title = styled.span`
  ${({ theme }) => theme.text.caption02};
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;
