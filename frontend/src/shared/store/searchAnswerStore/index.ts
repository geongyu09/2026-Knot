import { SearchAnswerFailedError } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations";
import { create } from "zustand";

import type {
  SearchAnswer,
  SearchAnswerStatus,
  SearchAnswerStreamEvent,
} from "@/shared/types/searchAnswer";

import { reduceSearchStreamEvent } from "./reduceSearchStreamEvent";

interface SearchAnswerState extends SearchAnswer {
  /** 서버가 받기 전에 실패해 입력창에 되돌릴 질문. 입력창이 가져가면 다시 `null`이 돼요 */
  rejectedQuestion: string | null;

  /**
   * 지금 받고 있는 요청의 컨트롤러. 질문을 보내고 끝나기 전까지만 값이 있어요.
   * 스트림을 끊는 데도 쓰고, 동작을 부른 요청이 지금 요청인지 가리는 표식으로도 써요.
   */
  controller: AbortController | null;
}

interface StartSearchAnswerParams {
  question: string;

  /** 후속 질문이면 이어 가는 대화 ID, 첫 질문이면 `null` */
  conversationId: number | null;
}

interface SearchAnswerActions {
  /**
   * 질문을 보내며 이전 답변을 비우고 접수 대기로 바꾼 뒤, 이번 요청의 컨트롤러를 돌려줘요.
   * 이미 접수 대기·생성 중이면 아무것도 바꾸지 않고 `null`을 돌려줘요(SEARCH-R6).
   */
  start: (params: StartSearchAnswerParams) => AbortController | null;

  /** 도착한 이벤트 하나를 답변에 반영해요. 지금 요청의 이벤트가 아니면 버려요 */
  applyEvent: (
    controller: AbortController,
    event: SearchAnswerStreamEvent,
  ) => void;

  /** 완료·중지로 끝난 방식을 남기고 컨트롤러를 놓아요. 받은 답변은 그대로 둬요 */
  settle: (
    controller: AbortController,
    status: Extract<SearchAnswerStatus, "COMPLETED" | "STOPPED">,
  ) => void;

  /**
   * 요청 실패를 남겨요. accepted 전(접수 대기)이면 서버에 질문이 저장되지 않았으므로 질문을 지우고
   * 입력창에 되돌릴 질문으로 남겨요(SEARCH-R4). accepted 뒤면 받은 답변을 두고 실패로 남겨요(SEARCH-R5).
   */
  fail: (controller: AbortController, error: unknown) => void;

  /** 받고 있는 스트림을 끊고 처음 상태로 돌아가요. 서버는 답변을 계속 만들어요(SEARCH-R8) */
  abort: () => void;

  /** 처음 상태로 돌아가요. 스트림은 끊지 않아요 */
  reset: () => void;

  /** 입력창이 되돌릴 질문을 가져간 뒤 지워요 */
  clearRejectedQuestion: () => void;
}

const IDLE_STATE: SearchAnswerState = {
  status: "IDLE",
  question: "",
  conversationId: null,
  questionMessageId: null,
  answerMessageId: null,
  text: "",
  evidences: [],
  stage: null,
  excludedDocumentCount: 0,
  failedCode: null,
  rejectedQuestion: null,
  controller: null,
};

/**
 * 지금 도착 중인 탐색 답변 하나를 담는 전역 저장소.
 *
 * 질문은 워크스페이스 독에서 보내고 답변은 대화 패널에 그려지는데, 둘이 서로 다른 구획이라 한곳에 두고 함께 읽어요.
 *
 * 상태 규칙은 모두 여기에 둬요. 이벤트를 답변에 반영하는 규칙은 같은 폴더의 `reduceSearchStreamEvent`가 맡아요.
 * 요청 하나가 끝나기 전에 끊거나 새 질문을 보내면 늦게 도착한 이벤트·결과가 새 답변을 덮어쓸 수 있어서,
 * 요청이 부르는 동작(`applyEvent`·`settle`·`fail`)은 받은 컨트롤러가 지금 컨트롤러와 같을 때만 반영해요.
 * 질문 전송 요청과 주소 이동은 `@hooks/domain/search/useSearchAnswerControl`이 맡아요.
 * 화면은 도메인 훅으로 읽고, 테스트는 답변이 테스트끼리 새지 않도록 여기서 직접 초기화해요.
 */
export const useSearchAnswerStore = create<
  SearchAnswerState & SearchAnswerActions
>()((set, get) => {
  const isCurrent = (controller: AbortController) =>
    get().controller === controller;

  return {
    ...IDLE_STATE,

    start: ({ question, conversationId }) => {
      const { status } = get();
      if (status === "SENDING" || status === "STREAMING") return null;

      const controller = new AbortController();
      set({
        ...IDLE_STATE,
        status: "SENDING",
        question,
        conversationId,
        controller,
      });

      return controller;
    },

    applyEvent: (controller, event) => {
      if (!isCurrent(controller)) return;

      set(reduceSearchStreamEvent(get(), event));
    },

    settle: (controller, status) => {
      if (!isCurrent(controller)) return;

      set({ status, controller: null });
    },

    fail: (controller, error) => {
      if (!isCurrent(controller)) return;

      if (get().status === "SENDING") {
        set({ ...IDLE_STATE, rejectedQuestion: get().question });
        return;
      }

      set({
        status: "FAILED",
        failedCode: error instanceof SearchAnswerFailedError ? error.code : null,
        controller: null,
      });
    },

    abort: () => {
      get().controller?.abort();
      set(IDLE_STATE);
    },

    reset: () => set(IDLE_STATE),

    clearRejectedQuestion: () => set({ rejectedQuestion: null }),
  };
});
