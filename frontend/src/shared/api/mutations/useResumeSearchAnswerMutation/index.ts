import type { SearchStreamEvent } from "@api/dto/search";
import { relaySearchAnswerUntilEnd } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations";
import { getSearchAnswerEventsApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations/[conversationId]/answers/[answerId]/events";
import { useMutation } from "@tanstack/react-query";

interface ResumeSearchAnswerMutationVariables {
  workspaceId: number;
  conversationId: number;
  /** 다시 받을 답변 메시지 ID */
  answerId: number;
  /** 이벤트가 도착할 때마다 불려요. 화면 상태에 쌓는 건 부르는 쪽이 해요 */
  onEvent: (event: SearchStreamEvent) => void;
  /** 화면을 떠나거나 다른 대화로 옮길 때 스트림을 끊는 신호 */
  signal?: AbortSignal;
}

/**
 * 끊겼거나 화면이 받고 있지 않은 탐색 답변에 다시 연결해 끝까지 받는 뮤테이션 훅(SEARCH-R8).
 *
 * 재연결 스트림도 끝 이벤트(completed·failed·stopped)로 끝나서, 끝을 판정하는 방식(`relaySearchAnswerUntilEnd`)을 같이 써요.
 * 다시 끊기면 `SearchAnswerDisconnectedError`를 던지고, 몇 번 더 연결할지는 `useSearchAnswerControl`이 정해요.
 */
const useResumeSearchAnswerMutation = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      conversationId,
      answerId,
      onEvent,
      signal,
    }: ResumeSearchAnswerMutationVariables) =>
      relaySearchAnswerUntilEnd({
        stream: getSearchAnswerEventsApi({
          workspaceId,
          conversationId,
          answerId,
          signal,
        }),
        onEvent,
        signal,
      }),
  });
};

export default useResumeSearchAnswerMutation;
