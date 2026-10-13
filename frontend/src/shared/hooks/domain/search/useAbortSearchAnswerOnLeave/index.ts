import useConversationId from "@hooks/domain/search/useConversationId";
import { useSearchAnswerStore } from "@store/searchAnswerStore";
import { useEffect } from "react";
import { useParams } from "react-router";

/**
 * 다른 대화로 옮기거나 워크스페이스를 나가면 받던 답변을 끊고 비우는 도메인 훅. 워크스페이스 레이아웃에서 한 번만 불러요.
 *
 * - 다른 대화: 주소의 대화가 답변의 대화와 다르면 끊어요. 다른 대화 화면에 이 답변이 섞이지 않게 하기 위해서예요.
 *   첫 질문이 accepted를 받기 전(답변의 대화가 아직 없음)에 어떤 대화든 열어도 끊어요.
 *   끊지 않으면 accepted가 왔을 때 새 대화 주소로 화면을 끌고 가요.
 * - 홈·새 대화 화면: 주소에 대화가 없으면 끊지 않아요. 홈 독에서 보낸 첫 질문은 accepted를 받아야 대화 주소가 생기기 때문이에요.
 * - 워크스페이스를 나가거나 다른 워크스페이스로 옮기면 끊어요. 워크스페이스끼리 옮길 때는 레이아웃이 그대로 남아 있어서
 *   언마운트가 아니라 워크스페이스 ID가 바뀌는 것으로 알아차려요.
 *
 * 끊어도 서버는 답변을 끝까지 만들어 저장해요(SEARCH-R8). 끝난 답변이 남아 있어도 같은 기준으로 비워요.
 */
const useAbortSearchAnswerOnLeave = () => {
  const { workspaceId } = useParams();
  const { conversationId: routeConversationId } = useConversationId();

  useEffect(() => {
    if (routeConversationId === undefined) return;

    const { status, conversationId, abort } = useSearchAnswerStore.getState();
    const isFirstQuestionBeforeAccepted =
      status === "SENDING" && conversationId === null;

    if (
      isFirstQuestionBeforeAccepted ||
      (conversationId !== null && conversationId !== routeConversationId)
    ) {
      abort();
    }
  }, [routeConversationId]);

  useEffect(
    () => () => useSearchAnswerStore.getState().abort(),
    [workspaceId],
  );
};

export default useAbortSearchAnswerOnLeave;
