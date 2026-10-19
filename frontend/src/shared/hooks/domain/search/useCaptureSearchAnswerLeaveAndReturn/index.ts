import useConversationId from "@hooks/domain/search/useConversationId";
import { useSearchAnswerStore } from "@store/searchAnswerStore";
import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { useEffect, useRef } from "react";

/** 떠난 답변. 그 대화로 돌아오면 떠나 있던 시간을 재요 */
interface LeftAnswer {
  conversationId: number;
  /** 떠난 시각(ms) */
  leftAt: number;
}

/** 0.1초 단위로 반올림한 초 */
const toSeconds = (ms: number) => Math.round(ms / 100) / 10;

/**
 * 탐색 답변을 기다리다 그 대화 화면을 떠나고 돌아오는 것을 사용 기록으로 보내는 도메인 훅. 워크스페이스 레이아웃에서 한 번만 불러요.
 *
 * - 떠남(`search_answer_left`): 답변이 끝나기 전(보내는 중 · 받는 중)에 그 답변의 대화 주소에서 다른 주소로 옮기면, 질문을 보낸 뒤 기다린 시간을 보내요.
 *   접수 전에는 대화 주소가 없어 세지 않아요. 접수되면 앱이 그 대화로 옮겨 가요.
 * - 돌아옴(`search_answer_returned`): 떠났던 그 대화 주소로 같은 탭에서 돌아오면, 떠나 있던 시간과 답변이 끝나 있었는지를 보내요.
 *   홈 · 문서로 옮기는 동안에는 답변을 뒤에서 계속 받아요. 다른 대화를 열어 답변이 끊겼거나 새 질문을 보냈으면 돌아올 답변이 없어 보내지 않아요.
 *
 * 다른 대화를 열면 `useAbortSearchAnswerOnLeave`가 답변을 끊으므로, 끊기 전의 상태로 떠남을 알 수 있게 그 훅보다 먼저 불러요.
 * 떠난 답변은 이 탭의 메모리에만 있어, 새로고침하거나 탭을 닫은 뒤 돌아오면 세지 않아요.
 */
const useCaptureSearchAnswerLeaveAndReturn = () => {
  const { conversationId: routeConversationId } = useConversationId();
  const previousRouteConversationIdRef = useRef(routeConversationId);
  const leftAnswerRef = useRef<LeftAnswer | null>(null);

  useEffect(() => {
    const previousRouteConversationId = previousRouteConversationIdRef.current;
    previousRouteConversationIdRef.current = routeConversationId;

    const { status, conversationId, sentAt } = useSearchAnswerStore.getState();
    const isAnswering = status === "SENDING" || status === "STREAMING";
    const now = Date.now();

    if (leftAnswerRef.current?.conversationId !== conversationId) {
      leftAnswerRef.current = null;
    }

    const isLeavingAnswer =
      isAnswering &&
      conversationId !== null &&
      previousRouteConversationId === conversationId &&
      routeConversationId !== conversationId;

    if (isLeavingAnswer) {
      captureAnalyticsEvent({
        event: "search_answer_left",
        properties: { waited_seconds: toSeconds(now - (sentAt ?? now)) },
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
          is_answer_ready: !isAnswering,
        },
      });
      leftAnswerRef.current = null;
    }
  }, [routeConversationId]);
};

export default useCaptureSearchAnswerLeaveAndReturn;
