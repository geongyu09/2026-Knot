import { useCallback } from "react";
import useCreateSearchConversationMutation from "@api/mutations/useCreateSearchConversationMutation";
import useCreateSearchQuestionMutation from "@api/mutations/useCreateSearchQuestionMutation";
import { searchKeys } from "@api/queryKey/search";
import useNavigateToChatSession from "@hooks/domain/chat/useNavigateToChatSession";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import { useSearchAnswerStore } from "@store/searchAnswerStore";
import { useQueryClient } from "@tanstack/react-query";
import { logRequestError } from "@utils/logRequestError";
import { useMatch } from "react-router";

interface SendQuestionParams {
  workspaceId: number;

  /** 이어 가는 대화 ID. 없으면 첫 질문으로 새 대화를 시작해요 */
  conversationId?: number;

  content: string;
}

/**
 * 탐색 질문을 보내고 도착하는 답변을 전역 저장소에 넘기는 도메인 훅.
 *
 * 저장소가 할 수 없는 일(뮤테이션 호출, 주소 이동)만 맡고, 상태를 어떻게 바꿀지는 저장소가 정해요.
 * - 보내기: 대화 ID가 없으면 첫 질문, 있으면 후속 질문으로 보내요. requestId는 보낼 때마다 새로 만들어요.
 *   접수 대기·생성 중이면 저장소가 시작을 거절해 보내지 않아요(SEARCH-R6).
 * - 첫 질문은 accepted로 받은 대화 주소로 옮겨 가요. 탐색 새 대화 화면에서 보냈으면 뒤로 가기로 입력 전 화면에
 *   돌아오지 않도록 바꿔치기하고, 홈처럼 다른 화면에서 보냈으면 뒤로 가기로 그 화면에 돌아오도록 쌓아요.
 * - 끝난 결과와 실패는 저장소에 넘기고, 화면은 저장소 상태로 읽어요.
 * - 완료·중지로 끝나면 그 대화의 메시지 조회를 무효화해요. 저장소가 다음 질문까지 끝난 답변을 들고 있어
 *   다시 받는 동안 화면은 바뀌지 않고, 다음 질문을 보낼 때 저장된 답변이 그 자리를 이어받아요.
 * - accepted 전에 실패하면 `{ isAcceptFailed: true }`를 돌려줘요. 질문을 보낸 독이 그 자리에서 입력창을 되돌리고
 *   안내해요(SEARCH-R4). 한 번 일어난 일이라 저장소에 두지 않고 보낸 쪽에만 돌려줘요.
 * - 중단: 받기만 끊고 처음 상태로 돌아가요. 서버는 답변을 계속 만들어요(SEARCH-R8).
 */
const useSearchAnswerControl = () => {
  const queryClient = useQueryClient();
  const { navigateToChatSession } = useNavigateToChatSession();
  const isNewConversationScreen = useMatch(PATH_ROUTE.CHAT) !== null;
  const { mutateAsync: createSearchConversation } =
    useCreateSearchConversationMutation();
  const { mutateAsync: createSearchQuestion } =
    useCreateSearchQuestionMutation();

  const sendQuestion = useCallback(
    async ({ workspaceId, conversationId, content }: SendQuestionParams) => {
      const { start, applyEvent, settle, fail } =
        useSearchAnswerStore.getState();

      const controller = start({
        question: content,
        conversationId: conversationId ?? null,
      });
      if (!controller) return { isAcceptFailed: false };

      // 첫 질문은 accepted가 와야 대화 ID를 알아요
      let acceptedConversationId = conversationId;

      const request = {
        workspaceId,
        content,
        requestId: crypto.randomUUID(),
        signal: controller.signal,
        onEvent: (event: Parameters<typeof applyEvent>[1]) => {
          applyEvent(controller, event);

          if (event.event !== "accepted") return;

          acceptedConversationId = event.data.conversationId;

          if (conversationId === undefined) {
            navigateToChatSession({
              workspaceId: String(workspaceId),
              sessionId: String(event.data.conversationId),
              replace: isNewConversationScreen,
            });
          }
        },
      };

      try {
        const result =
          conversationId === undefined
            ? await createSearchConversation(request)
            : await createSearchQuestion({ ...request, conversationId });

        // 끊었으면 결과가 없고, 저장소는 abort가 이미 비웠어요
        if (result) {
          settle(controller, result.status);
          queryClient.invalidateQueries({
            queryKey: searchKeys.messages({
              workspaceId,
              conversationId: acceptedConversationId,
            }),
          });
        }

        return { isAcceptFailed: false };
      } catch (error) {
        logRequestError("탐색 질문", error);

        return { isAcceptFailed: fail(controller, error) };
      }
    },
    [
      createSearchConversation,
      createSearchQuestion,
      isNewConversationScreen,
      navigateToChatSession,
      queryClient,
    ],
  );

  const abortAnswer = useCallback(
    () => useSearchAnswerStore.getState().abort(),
    [],
  );

  return { sendQuestion, abortAnswer };
};

export default useSearchAnswerControl;
