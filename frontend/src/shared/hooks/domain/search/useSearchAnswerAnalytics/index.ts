import useConversationId from "@hooks/domain/search/useConversationId";
import { useSearchAnswerStore } from "@store/searchAnswerStore";
import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { createSearchAnswerResultTracker } from "@utils/createSearchAnswerResultTracker";
import { useEffect, useRef } from "react";

type SearchAnswerState = ReturnType<typeof useSearchAnswerStore.getState>;

/** 떠난 답변. 그 대화로 돌아오면 떠나 있던 시간을 재요 */
interface LeftAnswer {
  conversationId: number;
  /** 떠난 시각(ms) */
  leftAt: number;
}

const isAnswering = ({ status }: SearchAnswerState) =>
  status === "SENDING" || status === "STREAMING";

/**
 * 답변이 끝난 방식. 받기를 끊었으면 결과가 아니라 `null`이에요.
 * 끊음과 접수 전 실패는 둘 다 처음 상태로 돌아가요. 끊을 때는 직전 요청을 abort하므로 그것으로 가려요
 */
const getOutcome = (state: SearchAnswerState, previous: SearchAnswerState) => {
  if (state.status === "IDLE") {
    if (previous.controller?.signal.aborted) return null;

    return previous.status === "SENDING" ? "ACCEPT_FAILED" : null;
  }

  return state.status === "SENDING" || state.status === "STREAMING"
    ? null
    : state.status;
};

/** 0.1초 단위로 반올림한 초 */
const toSeconds = (ms: number) => Math.round(ms / 100) / 10;

/**
 * 탐색 답변에서 일어난 일을 사용 기록으로 보내는 도메인 훅. 답변 저장소와 주소를 지켜보기만 하고, 탐색 동작은 바꾸지 않아요.
 * 워크스페이스 레이아웃에서 한 번만 불러요.
 *
 * - 답변 결과(`search_answer_result`): 질문을 보낸 뒤 완료 · 중지 · 실패 · 접수 전 실패로 끝나면 보내요. 홈 · 문서로 옮겨도 답변은 뒤에서 계속 받아 끝나면 보내요.
 *   받기를 끊었으면(다른 대화를 열거나 워크스페이스를 나감) 결과가 없어 보내지 않아요.
 * - 떠남(`search_answer_left`): 답변이 끝나기 전에 그 답변의 대화 주소에서 다른 주소로 옮기면, 질문을 보낸 뒤 기다린 시간을 보내요.
 *   접수 전에는 대화 주소가 없어 세지 않아요. 접수되면 앱이 그 대화로 옮겨 가요.
 * - 돌아옴(`search_answer_returned`): 떠났던 그 대화 주소로 같은 탭에서 돌아오면, 떠나 있던 시간과 답변이 끝나 있었는지를 보내요.
 *   그사이 답변이 끊겼거나 새 질문을 보냈으면 돌아올 답변이 없어 보내지 않아요. 새로고침하거나 탭을 닫은 뒤 돌아오면 세지 않아요.
 *
 * 다른 대화를 열면 `useAbortSearchAnswerOnLeave`가 답변을 끊으므로, 끊기 전의 상태로 떠남을 알 수 있게 그 훅보다 먼저 불러요.
 */
const useSearchAnswerAnalytics = () => {
  const { conversationId: routeConversationId } = useConversationId();
  // 지금 답변의 질문을 보낸 시각(ms)
  const sentAtRef = useRef<number | null>(null);
  const previousRouteConversationIdRef = useRef(routeConversationId);
  const leftAnswerRef = useRef<LeftAnswer | null>(null);

  useEffect(() => {
    let trackAnswerResult: ReturnType<
      typeof createSearchAnswerResultTracker
    > | null = null;

    return useSearchAnswerStore.subscribe((state, previous) => {
      if (isAnswering(state) && !isAnswering(previous)) {
        // 다시 시도는 보낼 때부터 질문 메시지 id가 있고, 첫 질문은 아직 대화 id가 없어요
        sentAtRef.current = Date.now();
        trackAnswerResult = createSearchAnswerResultTracker({
          question: state.question,
          isRetry: state.questionMessageId !== null,
          isFirstQuestion: state.conversationId === null,
          getAnswer: () => useSearchAnswerStore.getState().text,
        });
        return;
      }

      if (!isAnswering(previous) || isAnswering(state)) return;

      const outcome = getOutcome(state, previous);
      if (outcome) trackAnswerResult?.(outcome);
      trackAnswerResult = null;
    });
  }, []);

  useEffect(() => {
    const previousRouteConversationId = previousRouteConversationIdRef.current;
    previousRouteConversationIdRef.current = routeConversationId;

    const state = useSearchAnswerStore.getState();
    const { conversationId } = state;
    const now = Date.now();

    if (leftAnswerRef.current?.conversationId !== conversationId) {
      leftAnswerRef.current = null;
    }

    const isLeavingAnswer =
      isAnswering(state) &&
      conversationId !== null &&
      previousRouteConversationId === conversationId &&
      routeConversationId !== conversationId;

    if (isLeavingAnswer) {
      captureAnalyticsEvent({
        event: "search_answer_left",
        properties: {
          waited_seconds: toSeconds(now - (sentAtRef.current ?? now)),
        },
      });
      leftAnswerRef.current = { conversationId, leftAt: now };
      return;
    }

    const leftAnswer = leftAnswerRef.current;
    if (leftAnswer && routeConversationId === leftAnswer.conversationId) {
      captureAnalyticsEvent({
        event: "search_answer_returned",
        properties: {
          away_seconds: toSeconds(now - leftAnswer.leftAt),
          is_answer_ready: !isAnswering(state),
        },
      });
      leftAnswerRef.current = null;
    }
  }, [routeConversationId]);
};

export default useSearchAnswerAnalytics;
