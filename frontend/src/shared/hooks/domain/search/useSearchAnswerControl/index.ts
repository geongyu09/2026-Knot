import { useCallback } from "react";
import useCreateSearchConversationMutation from "@api/mutations/useCreateSearchConversationMutation";
import useCreateSearchQuestionMutation from "@api/mutations/useCreateSearchQuestionMutation";
import useRetrySearchAnswerMutation from "@api/mutations/useRetrySearchAnswerMutation";
import { searchKeys } from "@api/queryKey/search";
import useNavigateToChatSession from "@hooks/domain/chat/useNavigateToChatSession";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import {
  type SearchAnswerRetryTarget,
  useSearchAnswerStore,
} from "@store/searchAnswerStore";
import { useQueryClient } from "@tanstack/react-query";
import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { logRequestError } from "@utils/logRequestError";
import { useMatch } from "react-router";

import type { SearchAnswerStreamEvent } from "@/shared/types/searchAnswer";

interface SendQuestionParams {
  workspaceId: number;

  /** 이어 가는 대화 ID. 없으면 첫 질문으로 새 대화를 시작해요 */
  conversationId?: number;

  content: string;
}

interface RetryAnswerParams extends SearchAnswerRetryTarget {
  workspaceId: number;

  conversationId: number;

  /** 실패한 답변의 질문 내용. 다시 받는 동안 그 턴의 질문 말풍선에 그대로 보여요 */
  question: string;
}

/** 첫 질문·후속 질문·재시도 요청이 함께 받는 값 */
interface AnswerRequest {
  requestId: string;
  signal: AbortSignal;
  onEvent: (event: SearchAnswerStreamEvent) => void;
}

interface RunAnswerParams {
  workspaceId: number;

  /** 이어 가는 대화 ID. 없으면 첫 질문이라 accepted로 받은 대화 주소로 옮겨 가요 */
  conversationId?: number;

  question: string;

  retryOf?: SearchAnswerRetryTarget;

  /** 공통 값을 받아 이번 요청의 뮤테이션을 불러요. 끝난 결과는 `relaySearchAnswerUntilEnd`와 같아요 */
  requestAnswer: (
    request: AnswerRequest,
  ) => Promise<{ status: "COMPLETED" | "STOPPED" } | null>;
}

/**
 * 탐색 질문을 보내거나 실패한 답변을 다시 요청하고, 도착하는 답변을 전역 저장소에 넘기는 도메인 훅.
 *
 * 저장소가 할 수 없는 일(뮤테이션 호출, 주소 이동)만 맡고, 상태를 어떻게 바꿀지는 저장소가 정해요.
 * - 보내기: 대화 ID가 없으면 첫 질문, 있으면 후속 질문으로 보내요. requestId는 보낼 때마다 새로 만들어요.
 *   접수 대기·생성 중이면 저장소가 시작을 거절해 보내지 않아요(SEARCH-R6).
 * - 질문이 접수(accepted)되면 대화 목록 조회를 무효화해요. 첫 질문은 서버가 이때 대화를 만들어 목록에 넣고,
 *   후속 질문은 그 대화가 맨 위로 올라가요. 답변이 끝나기 전에 목록에 보이도록 접수 때 다시 받아요(COMMON-01).
 * - 첫 질문은 accepted로 받은 대화 주소로 옮겨 가요. 탐색 새 대화 화면에서 보냈으면 뒤로 가기로 입력 전 화면에
 *   돌아오지 않도록 바꿔치기하고, 홈처럼 다른 화면에서 보냈으면 뒤로 가기로 그 화면에 돌아오도록 쌓아요.
 * - 끝난 결과와 실패는 저장소에 넘기고, 화면은 저장소 상태로 읽어요.
 * - 완료·중지로 끝나면 그 대화의 메시지 조회를 무효화해요. 저장소가 다음 질문까지 끝난 답변을 들고 있어
 *   다시 받는 동안 화면은 바뀌지 않고, 다음 질문을 보낼 때 저장된 답변이 그 자리를 이어받아요.
 * - accepted 뒤에 실패해도 메시지 조회를 무효화해요. 다시 시도가 접수 전에 실패하면 저장소가 비워지고 저장된 턴이
 *   그 자리를 이어받는데, 그때 조회 결과가 생성 중으로 낡아 있으면 실패 안내 대신 진행 문구가 남기 때문이에요.
 * - accepted 전에 실패하면 `{ isAcceptFailed: true }`를 돌려줘요. 질문을 보낸 독이 그 자리에서 입력창을 되돌리고
 *   안내해요(SEARCH-R4). 한 번 일어난 일이라 저장소에 두지 않고 보낸 쪽에만 돌려줘요.
 * - 다시 시도: 실패한 답변의 질문으로 답변을 다시 받아요(SEARCH-R5). 대화가 이미 있으니 주소는 옮기지 않고,
 *   접수되면 첫 질문이 실패해 목록에서 빠져 있던 대화도 목록에 다시 나타나요.
 *   접수 전에 실패하면 저장된 실패 답변이 그대로 보여 다시 누를 수 있어요.
 * - 중단: 받기만 끊고 처음 상태로 돌아가요. 서버는 답변을 계속 만들어요(SEARCH-R8).
 * - 사용 기록: 끝난 결과(완료 · 중지 · 실패 · 접수 전 실패)를 걸린 시간 · 질문 글 · 받은 답변 글과 함께 `search_answer_result`로 보내요.
 *   홈 · 문서로 옮겨도 답변은 뒤에서 계속 받으므로 끝나면 보내요. 받기를 끊었으면 결과가 없어 보내지 않아요.
 */
const useSearchAnswerControl = () => {
  const queryClient = useQueryClient();
  const { navigateToChatSession } = useNavigateToChatSession();
  const isNewConversationScreen = useMatch(PATH_ROUTE.CHAT) !== null;
  const { mutateAsync: createSearchConversation } =
    useCreateSearchConversationMutation();
  const { mutateAsync: createSearchQuestion } =
    useCreateSearchQuestionMutation();

  const { mutateAsync: retrySearchAnswer } = useRetrySearchAnswerMutation();

  const runAnswer = useCallback(
    async ({
      workspaceId,
      conversationId,
      question,
      retryOf,
      requestAnswer,
    }: RunAnswerParams) => {
      const { start, applyEvent, settle, fail } =
        useSearchAnswerStore.getState();

      const controller = start({
        question,
        conversationId: conversationId ?? null,
        retryOf,
      });
      if (!controller) return { isAcceptFailed: false };

      const sentAt = useSearchAnswerStore.getState().sentAt ?? Date.now();
      const captureAnswerResult = (
        result: "completed" | "stopped" | "failed" | "accept_failed",
      ) =>
        captureAnalyticsEvent({
          event: "search_answer_result",
          properties: {
            result,
            is_retry: retryOf !== undefined,
            is_first_question: conversationId === undefined,
            // 0.1초 단위로 반올림해요
            answer_seconds: Math.round((Date.now() - sentAt) / 100) / 10,
            question,
            answer: useSearchAnswerStore.getState().text,
          },
        });

      // 첫 질문은 accepted가 와야 대화 ID를 알아요
      let acceptedConversationId = conversationId;

      const invalidateMessages = () => {
        if (acceptedConversationId === undefined) return;

        queryClient.invalidateQueries({
          queryKey: searchKeys.messages({
            workspaceId,
            conversationId: acceptedConversationId,
          }),
        });
      };

      try {
        const result = await requestAnswer({
          requestId: crypto.randomUUID(),
          signal: controller.signal,
          onEvent: (event) => {
            applyEvent(controller, event);

            if (event.event !== "accepted") return;

            acceptedConversationId = event.data.conversationId;
            queryClient.invalidateQueries({
              queryKey: searchKeys.conversations(workspaceId),
            });

            if (conversationId === undefined) {
              navigateToChatSession({
                workspaceId: String(workspaceId),
                sessionId: String(event.data.conversationId),
                replace: isNewConversationScreen,
              });
            }
          },
        });

        // 끊었으면 결과가 없고, 저장소는 abort가 이미 비웠어요
        if (result) {
          settle(controller, result.status);
          invalidateMessages();
          captureAnswerResult(
            result.status === "COMPLETED" ? "completed" : "stopped",
          );
        }

        return { isAcceptFailed: false };
      } catch (error) {
        logRequestError({ feature: "search", action: "탐색 질문", error });
        invalidateMessages();

        const isAcceptFailed = fail(controller, error);
        captureAnswerResult(isAcceptFailed ? "accept_failed" : "failed");

        return { isAcceptFailed };
      }
    },
    [isNewConversationScreen, navigateToChatSession, queryClient],
  );

  const sendQuestion = useCallback(
    ({ workspaceId, conversationId, content }: SendQuestionParams) =>
      runAnswer({
        workspaceId,
        conversationId,
        question: content,
        requestAnswer: (request) =>
          conversationId === undefined
            ? createSearchConversation({ ...request, workspaceId, content })
            : createSearchQuestion({
                ...request,
                workspaceId,
                conversationId,
                content,
              }),
      }),
    [createSearchConversation, createSearchQuestion, runAnswer],
  );

  const retryAnswer = useCallback(
    async ({
      workspaceId,
      conversationId,
      question,
      questionMessageId,
      answerMessageId,
    }: RetryAnswerParams) => {
      await runAnswer({
        workspaceId,
        conversationId,
        question,
        retryOf: { questionMessageId, answerMessageId },
        requestAnswer: (request) =>
          retrySearchAnswer({
            ...request,
            workspaceId,
            conversationId,
            questionId: questionMessageId,
          }),
      });
    },
    [retrySearchAnswer, runAnswer],
  );

  const abortAnswer = useCallback(
    () => useSearchAnswerStore.getState().abort(),
    [],
  );

  return { sendQuestion, retryAnswer, abortAnswer };
};

export default useSearchAnswerControl;
