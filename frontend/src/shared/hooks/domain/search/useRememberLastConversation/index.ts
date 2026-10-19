import useConversationId from "@hooks/domain/search/useConversationId";
import {
  clearLastConversationId,
  saveLastConversationId,
} from "@utils/lastConversation";
import { useEffect } from "react";
import { useParams } from "react-router";

/**
 * 탐색 화면에서 지금 보는 대화를 워크스페이스마다 기억하는 도메인 훅. 탐색 화면의 대화 칸에서 한 번만 불러요.
 *
 * 다른 화면에 다녀와 GNB 탐색을 누르면 `useWorkspaceNav`가 기억한 대화로 보내요. 받던 답변도 그 대화 주소에서 이어 보여요.
 * - 대화를 보면: 그 대화를 기억해요. 새 대화의 첫 질문이 접수되어 대화 주소로 옮겨 가도 여기서 기억해요.
 * - 빈 새 대화를 보면: 기억을 비워요. 새 채팅을 연 뒤 다른 화면에 다녀와도 빈 새 대화가 열려요.
 */
const useRememberLastConversation = () => {
  const { workspaceId } = useParams();
  const { conversationId } = useConversationId();

  useEffect(() => {
    if (!workspaceId) return;

    if (conversationId === undefined) {
      clearLastConversationId(workspaceId);
      return;
    }

    saveLastConversationId({ workspaceId, conversationId });
  }, [workspaceId, conversationId]);
};

export default useRememberLastConversation;
