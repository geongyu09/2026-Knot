import { useParams } from "react-router";
import useSearchConversationsQuery from "@api/queries/useSearchConversationsQuery";
import useNavigateToChatSession from "@hooks/domain/chat/useNavigateToChatSession";
import { groupSearchConversations } from "../utils/groupSearchConversations";

/**
 * 내 탐색 대화 목록을 기간별로 묶고, 고른 대화로 이동시켜요.
 *
 * 지금 보고 있는 대화가 무엇인지는 URL이 들고 있으므로 여기서는 읽기만 해요.
 */
export const useSearchConversationList = () => {
  // 주소 파라미터 이름은 아직 sessionId예요. 값은 탐색 대화 ID와 같아요
  const { workspaceId, sessionId } = useParams();
  const { navigateToChatSession } = useNavigateToChatSession();

  const { data } = useSearchConversationsQuery({
    workspaceId: workspaceId ? Number(workspaceId) : null,
  });

  const groups = groupSearchConversations({
    conversations: data?.items ?? [],
  });

  const openedConversationId = sessionId ?? null;

  const handleSelectConversation = (conversationId: number) => {
    if (!workspaceId) return;

    navigateToChatSession({
      workspaceId,
      sessionId: String(conversationId),
    });
  };

  return { groups, openedConversationId, handleSelectConversation };
};
