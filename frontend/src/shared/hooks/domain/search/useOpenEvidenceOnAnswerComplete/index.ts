import { SCREEN_CONDITION } from "@constants/breakpoint";
import useMediaQuery from "@hooks/common/useMediaQuery";
import useConversationId from "@hooks/domain/search/useConversationId";
import useOpenedEvidenceMessage from "@hooks/domain/search/useOpenedEvidenceMessage";
import { useSearchAnswerStore } from "@store/searchAnswerStore";
import { useEffect, useEffectEvent } from "react";

/**
 * 근거가 있는 답변이 끝나면 그 답변의 찾은 기록 패널을 저절로 여는 도메인 훅(SEARCH-R10). 워크스페이스 레이아웃에서 한 번만 불러요.
 *
 * - 답변이 완료(COMPLETED)로 바뀌는 순간 한 번만 열어요. 회원이 닫은 뒤 다시 그려지거나 대화를 다시 받아도 다시 열지 않아요.
 * - 근거가 없거나 중지·실패로 끝나면 열지 않아요.
 * - 지금 주소의 대화가 답변의 대화일 때만 열어요. 홈 같은 다른 화면으로 나간 뒤 끝난 답변이 그 화면 주소에 끼어들지 않게 하기 위해서예요.
 * - 1024 미만에서는 찾은 기록이 답변을 덮으므로 열지 않아요(RESP-R3, 닫힌 상태가 기본). 회원이 버튼으로 열어요.
 */
const useOpenEvidenceOnAnswerComplete = () => {
  const { conversationId: routeConversationId } = useConversationId();
  const { openEvidenceMessage } = useOpenedEvidenceMessage();
  const { isMatched: isBelowDesktop } = useMediaQuery(
    SCREEN_CONDITION.belowDesktop,
  );

  // 끝난 시점의 주소로 열어야 하므로, 구독은 한 번만 걸고 주소와 여는 함수는 그때마다 최신 값을 읽어요
  const openOnComplete = useEffectEvent(
    (answerMessageId: number, conversationId: number | null) => {
      if (conversationId !== routeConversationId) return;
      if (isBelowDesktop) return;

      openEvidenceMessage(answerMessageId);
    },
  );

  useEffect(
    () =>
      useSearchAnswerStore.subscribe((state, prevState) => {
        const isJustCompleted =
          prevState.status !== "COMPLETED" && state.status === "COMPLETED";
        if (!isJustCompleted) return;
        if (state.evidences.length === 0 || state.answerMessageId === null)
          return;

        openOnComplete(state.answerMessageId, state.conversationId);
      }),
    [],
  );
};

export default useOpenEvidenceOnAnswerComplete;
