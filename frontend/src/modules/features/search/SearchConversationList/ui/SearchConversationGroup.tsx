import styled from "@emotion/styled";
import type { SearchConversationListItem } from "../types/searchConversation";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import SearchConversationRow from "./SearchConversationRow";

interface SearchConversationGroupProps {
  label: string;
  conversations: SearchConversationListItem[];
  openedConversationId: string | null;
  onSelectConversation: (conversationId: number) => void;
}

/**
 * "오늘"처럼 같은 기간에 묶인 대화를 기간 이름과 함께 보여줍니다.
 */
export default function SearchConversationGroup({
  label,
  conversations,
  openedConversationId,
  onSelectConversation,
}: SearchConversationGroupProps) {
  return (
    <Container>
      <Label>{label}</Label>

      <Rows>
        {conversations.map(({ id, title, updatedAt }) => (
          <SearchConversationRow
            key={id}
            title={title}
            updatedAtLabel={formatRelativeTime({ date: updatedAt })}
            isSelected={openedConversationId === String(id)}
            onSelect={() => onSelectConversation(id)}
          />
        ))}
      </Rows>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
`;

const Label = styled.h3`
  width: 100%;
  ${({ theme }) => theme.text.caption01};
  color: ${({ theme }) => theme.neutral[600]};
`;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
  width: 100%;
`;
