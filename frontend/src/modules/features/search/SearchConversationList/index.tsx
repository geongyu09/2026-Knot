import styled from "@emotion/styled";
import { useSearchConversationList } from "./model/useSearchConversationList";
import EmptySearchConversationList from "./ui/EmptySearchConversationList";
import SearchConversationGroup from "./ui/SearchConversationGroup";

/**
 * 워크스페이스에 쌓인 내 탐색 대화 목록.
 */
export default function SearchConversationList() {
  const { groups, openedConversationId, handleSelectConversation } =
    useSearchConversationList();

  if (groups.length === 0) {
    return <EmptySearchConversationList />;
  }

  return (
    <Container>
      {groups.map(({ label, conversations }) => (
        <SearchConversationGroup
          key={label}
          label={label}
          conversations={conversations}
          openedConversationId={openedConversationId}
          onSelectConversation={handleSelectConversation}
        />
      ))}
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* 12px */
  width: 100%;
  height: 100%;
  overflow-y: auto;
`;
