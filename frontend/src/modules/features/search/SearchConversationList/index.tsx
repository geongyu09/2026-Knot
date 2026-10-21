import styled from "@emotion/styled";
import { useSearchConversationList } from "./model/useSearchConversationList";
import EmptySearchConversationList from "./ui/EmptySearchConversationList";
import SearchConversationGroup from "./ui/SearchConversationGroup";
import SearchConversationListLoadFailed from "./ui/SearchConversationListLoadFailed";

/**
 * 워크스페이스에 쌓인 내 탐색 대화 목록.
 *
 * 목록을 받지 못하고 실패하면 빈 안내 대신 실패 안내(`SearchConversationListLoadFailed`)를 둬요. 「다시 시도」는 대화 목록만 다시 받아요.
 */
export default function SearchConversationList() {
  const {
    groups,
    openedConversationId,
    isLoadFailed,
    handleSelectConversation,
    handleRetry,
  } = useSearchConversationList();

  if (isLoadFailed) {
    return <SearchConversationListLoadFailed onRetry={handleRetry} />;
  }

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
