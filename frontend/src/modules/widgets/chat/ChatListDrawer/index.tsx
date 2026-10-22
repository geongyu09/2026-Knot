import { MEDIA_QUERY } from "@constants/breakpoint";
import styled from "@emotion/styled";
import SearchConversationList from "@features/search/SearchConversationList";
import useNavigateToNewChat from "@hooks/domain/chat/useNavigateToNewChat";
import { useParams } from "react-router";

import PlusIcon from "@/assets/icons/plus.svg";

/**
 * 대화 목록 드로어. 목록은 `SearchConversationList`가 그리고, 여기서는 드로어 껍데기와 새 채팅 버튼만 얹어요.
 */
export default function ChatListDrawer() {
  const { workspaceId } = useParams();
  const { navigateToNewChat } = useNavigateToNewChat();

  const handleStartNewChat = () => {
    if (!workspaceId) return;

    navigateToNewChat(workspaceId);
  };

  return (
    <Container aria-label="대화 목록">
      <DrawerHead>
        <Title>대화</Title>
        <NewChatButton type="button" onClick={handleStartNewChat}>
          <PlusIcon size={14} />새 채팅
        </NewChatButton>
      </DrawerHead>

      <SearchConversationList />
    </Container>
  );
}

const Container = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* 12px */
  width: 17.5rem; /* 280px */
  height: 100%;
  padding: 1rem; /* 16px */
  border: 1px solid ${({ theme }) => theme.neutral[200]};
  border-radius: 1.5rem; /* 24px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow03};

  /* 모바일 덮개는 화면 폭에서 오른쪽 70px을 남기고 최대 320px까지 넓혀요(RESP-R2) */
  ${MEDIA_QUERY.mobile} {
    width: min(20rem, 100vw - 4.375rem); /* 320px */
  }
`;

const DrawerHead = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  height: 2.5rem; /* 40px */
  padding-left: 0.25rem; /* 4px */
`;

const Title = styled.h2`
  color: ${({ theme }) => theme.neutral[900]};
  ${({ theme }) => theme.text.label01};
`;

const NewChatButton = styled.button`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.3125rem; /* 5px */
  height: 1.875rem; /* 30px */
  padding: 0 0.75rem 0 0.625rem; /* 0 12px 0 10px */
  border-radius: 62.4375rem; /* 999px */
  background-color: ${({ theme }) => theme.neutral[700]};
  color: ${({ theme }) => theme.neutral[0]};
  white-space: nowrap;
  transition: background-color 0.2s ease-in;
  ${({ theme }) => theme.text.caption01};

  &:hover {
    background-color: ${({ theme }) => theme.neutral[800]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 2px;
  }
`;
