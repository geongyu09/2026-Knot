import { useCallback } from "react";
import useCreateSearchConversationMutation from "@api/mutations/useCreateSearchConversationMutation";
import useCreateSearchQuestionMutation from "@api/mutations/useCreateSearchQuestionMutation";
import useNavigateToChatSession from "@hooks/domain/chat/useNavigateToChatSession";
import { useSearchAnswerStore } from "@store/searchAnswerStore";
import { logRequestError } from "@utils/logRequestError";


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
 * - 첫 질문은 accepted로 받은 대화 주소로 옮겨 가요. 뒤로 가기로 입력 전 화면에 돌아오지 않도록 바꿔치기해요.
 * - 끝난 결과와 실패는 저장소에 넘겨요. 결과는 저장소 상태로 읽어요.
 * - 중단: 받기만 끊고 처음 상태로 돌아가요. 서버는 답변을 계속 만들어요(SEARCH-R8).
 */
const useSearchAnswerControl = () => {
  const { navigateToChatSession } = useNavigateToChatSession();
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
      if (!controller) return;

      const request = {
        workspaceId,
        content,
        requestId: crypto.randomUUID(),
        signal: controller.signal,
        onEvent: (event: Parameters<typeof applyEvent>[1]) => {
          applyEvent(controller, event);

          if (event.event === "accepted" && conversationId === undefined) {
            navigateToChatSession({
              workspaceId: String(workspaceId),
              sessionId: String(event.data.conversationId),
              replace: true,
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
        if (result) settle(controller, result.status);
      } catch (error) {
        logRequestError("탐색 질문", error);
        fail(controller, error);
      }
    },
    [createSearchConversation, createSearchQuestion, navigateToChatSession],
  );

  const abortAnswer = useCallback(
    () => useSearchAnswerStore.getState().abort(),
    [],
  );

  return { sendQuestion, abortAnswer };
};

export default useSearchAnswerControl;
