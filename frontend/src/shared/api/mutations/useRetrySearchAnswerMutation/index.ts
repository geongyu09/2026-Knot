import {
  PostSearchAnswerRetryRequestDto,
  type PostSearchAnswerRetryRequestInput,
  type SearchStreamEvent,
} from "@api/dto/search";
import { relaySearchAnswerUntilEnd } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations";
import { retrySearchAnswerApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations/[conversationId]/questions/[questionId]/retry";
import { useMutation } from "@tanstack/react-query";

interface RetrySearchAnswerMutationVariables
  extends PostSearchAnswerRetryRequestInput {
  workspaceId: number;
  conversationId: number;
  /** 답변이 실패한 질문 메시지 ID */
  questionId: number;
  /** 이벤트가 도착할 때마다 불려요. 화면 상태에 쌓는 건 부르는 쪽이 해요 */
  onEvent: (event: SearchStreamEvent) => void;
  /** 화면을 떠나거나 다른 대화로 옮길 때 스트림을 끊는 신호 */
  signal?: AbortSignal;
}

/**
 * 실패한 탐색 답변을 같은 질문으로 다시 만들고 SSE로 도착하는 답변의 수명주기(보내는 중·실패·완료)를 다루는 뮤테이션 훅.
 *
 * 응답 스트림이 첫 질문·후속 질문과 같아서 끝을 판정하는 방식(`relaySearchAnswerUntilEnd`)도 같이 써요.
 * 끝난 뒤 메시지 조회 무효화는 보내기와 함께 `useSearchAnswerControl`이 해요.
 */
const useRetrySearchAnswerMutation = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      conversationId,
      questionId,
      onEvent,
      signal,
      ...input
    }: RetrySearchAnswerMutationVariables) =>
      relaySearchAnswerUntilEnd({
        stream: retrySearchAnswerApi({
          workspaceId,
          conversationId,
          questionId,
          body: new PostSearchAnswerRetryRequestDto(input),
          signal,
        }),
        onEvent,
        signal,
      }),
  });
};

export default useRetrySearchAnswerMutation;
