import { useSearchAnswerStore } from "@store/searchAnswerStore";

/**
 * 전송 버튼과 입력창이 쓰는 답변 진행 여부만 읽는 도메인 훅.
 *
 * 답변 텍스트·근거는 구독하지 않아, delta가 도착해도 이 훅을 쓰는 컴포넌트(독)는 다시 그려지지 않아요.
 * 전송 버튼은 접수 대기(`isSending`)과 생성 중(`isStreaming`)을 나눠 그리고, 둘 중 하나면 다시 보내지 않아요(SEARCH-R6).
 * 서버가 받기 전에 실패한 질문은 `rejectedQuestion`으로 입력창에 되돌리며 오류 토스트를 띄우고, `clearRejectedQuestion`으로 지워요(SEARCH-R4).
 *
 * 도착 중인 답변 내용은 `useSearchAnswerState`, 보내기·중단은 `useSearchAnswerControl`이 맡아요.
 */
const useSearchAnswerStatus = () => {
  const status = useSearchAnswerStore((state) => state.status);
  const rejectedQuestion = useSearchAnswerStore(
    (state) => state.rejectedQuestion,
  );
  const clearRejectedQuestion = useSearchAnswerStore(
    (state) => state.clearRejectedQuestion,
  );

  const isSending = status === "SENDING";
  const isStreaming = status === "STREAMING";

  return {
    status,
    isSending,
    isStreaming,
    isAnswerPending: isSending || isStreaming,
    rejectedQuestion,
    clearRejectedQuestion,
  };
};

export default useSearchAnswerStatus;
