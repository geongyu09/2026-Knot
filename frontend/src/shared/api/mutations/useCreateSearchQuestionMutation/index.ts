import {
  PostSearchQuestionRequestDto,
  type PostSearchQuestionRequestInput,
  type SearchStreamEvent,
} from "@api/dto/search";
import { relaySearchAnswerUntilEnd } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations";
import { createSearchQuestionApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations/[conversationId]/questions";
import { useMutation } from "@tanstack/react-query";

interface CreateSearchQuestionMutationVariables
  extends PostSearchQuestionRequestInput {
  workspaceId: number;
  /** 후속 질문을 보낼 탐색 대화 ID */
  conversationId: number;
  /** 이벤트가 도착할 때마다 불려요. 화면 상태에 쌓는 건 부르는 쪽이 해요 */
  onEvent: (event: SearchStreamEvent) => void;
  /** 화면을 떠나거나 다른 대화로 옮길 때 스트림을 끊는 신호 */
  signal?: AbortSignal;
}

/**
 * 이어 가던 탐색 대화에 후속 질문을 보내고 SSE로 도착하는 답변의 수명주기(보내는 중·실패·완료)를 다루는 뮤테이션 훅.
 *
 * 도착하는 이벤트는 화면이 계속 다시 그려져야 하므로 뮤테이션 상태가 아니라 `onEvent`로 넘겨요.
 * 메시지 조회·대화 목록 쿼리가 아직 없어 무효화할 쿼리는 없어요.
 */
const useCreateSearchQuestionMutation = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      conversationId,
      onEvent,
      signal,
      ...input
    }: CreateSearchQuestionMutationVariables) =>
      relaySearchAnswerUntilEnd({
        stream: createSearchQuestionApi({
          workspaceId,
          conversationId,
          body: new PostSearchQuestionRequestDto(input),
          signal,
        }),
        onEvent,
      }),
  });
};

export default useCreateSearchQuestionMutation;
