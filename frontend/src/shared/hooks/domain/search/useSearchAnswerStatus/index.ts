import { useSearchAnswerStore } from "@store/searchAnswerStore";

/**
 * 전송 버튼이 쓰는 답변 진행 여부만 읽는 도메인 훅.
 *
 * 답변 텍스트·근거는 구독하지 않아, delta가 도착해도 이 훅을 쓰는 컴포넌트(독)는 다시 그려지지 않아요.
 * 전송 버튼은 접수 대기(`isSending`)과 생성 중(`isStreaming`)을 나눠 그리고, 둘 중 하나면 다시 보내지 않아요(SEARCH-R6).
 *
 * 도착 중인 답변 내용은 `useSearchAnswerState`, 보내기·중단은 `useSearchAnswerControl`이 맡아요.
 */
const useSearchAnswerStatus = () => {
  const status = useSearchAnswerStore((state) => state.status);

  const isSending = status === "SENDING";
  const isStreaming = status === "STREAMING";

  return {
    isSending,
    isStreaming,
    isAnswerPending: isSending || isStreaming,
  };
};

export default useSearchAnswerStatus;
