import { useParams } from "react-router";
import useSearchConversationsQuery from "@api/queries/useSearchConversationsQuery";
import useRedirectToLoginOnUnauthorized from "@hooks/domain/auth/useRedirectToLoginOnUnauthorized";
import useNavigateToChatSession from "@hooks/domain/chat/useNavigateToChatSession";
import { groupSearchConversations } from "../utils/groupSearchConversations";

/**
 * 내 탐색 대화 목록을 기간별로 묶고, 고른 대화로 이동시켜요.
 *
 * 지금 보고 있는 대화가 무엇인지는 URL이 들고 있으므로 여기서는 읽기만 해요.
 *
 * 받은 목록 없이 조회에 실패하면 `isLoadFailed`가 `true`이고, `handleRetry`는 대화 목록만 다시 받아요.
 * 로그인이 풀린 실패(401)는 안내 대신 로그인 화면으로 보내요.
 * 목록을 한 번 받은 뒤에는 다시 불러오기가 실패해도 받은 목록을 계속 보여줘요.
 */
export const useSearchConversationList = () => {
  // 주소 파라미터 이름은 아직 sessionId예요. 값은 탐색 대화 ID와 같아요
  const { workspaceId, sessionId } = useParams();
  const { navigateToChatSession } = useNavigateToChatSession();

  const { data, error, isError, refetch } = useSearchConversationsQuery({
    workspaceId: workspaceId ? Number(workspaceId) : null,
  });
  const { isUnauthorized } = useRedirectToLoginOnUnauthorized({ error });

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

  // 화면을 새로고침하지 않고 목록만 다시 조회해요. 새로고침하면 브라우저 안에만 있는 진행 중인 녹음이 사라져요
  const handleRetry = () => {
    refetch();
  };

  return {
    groups,
    openedConversationId,
    isLoadFailed: data === undefined && isError && !isUnauthorized,
    handleSelectConversation,
    handleRetry,
  };
};
