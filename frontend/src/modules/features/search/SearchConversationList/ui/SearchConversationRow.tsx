import styled from "@emotion/styled";

interface SearchConversationRowProps {
  title: string;
  /** 마지막으로 메시지가 오간 시각을 "2일 전"처럼 바꾼 문구 */
  updatedAtLabel: string;
  isSelected?: boolean;
  onSelect: () => void;
}

/**
 * 대화 목록의 한 줄. 대화 제목과 마지막으로 오간 시각을 보여줍니다.
 *
 * 지금 보고 있는 대화는 `isSelected`로 채워진 모양이 되며, 이 상태를 `aria-current`로도 알립니다.
 */
export default function SearchConversationRow({
  title,
  updatedAtLabel,
  isSelected = false,
  onSelect,
}: SearchConversationRowProps) {
  return (
    <Container
      type="button"
      aria-current={isSelected ? "page" : undefined}
      $isSelected={isSelected}
      onClick={onSelect}
    >
      <Title $isSelected={isSelected}>{title}</Title>
      <Time>{updatedAtLabel}</Time>
    </Container>
  );
}

const Container = styled.button<{ $isSelected: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1875rem; /* 3px */
  width: 100%;
  padding: 0.625rem; /* 10px */
  border-radius: 0.75rem; /* 12px */
  text-align: left;
  cursor: pointer;
  transition: background-color 0.3s ease-in;

  background-color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.neutral[100] : "transparent"};

  &:hover {
    background-color: ${({ theme }) => theme.neutral[100]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 2px;
  }
`;

const Title = styled.span<{ $isSelected: boolean }>`
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  ${({ theme }) => theme.text.caption02};

  color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.neutral[900] : theme.neutral[600]};
`;

const Time = styled.span`
  ${({ theme }) => theme.text.caption01};
  color: ${({ theme }) => theme.neutral[600]};
`;
