import {
  SearchStreamAcceptedDto,
  SearchStreamDeltaDto,
  SearchStreamFailedDto,
} from "@api/dto/search";
import { SearchAnswerFailedError } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations";
import { searchAnswerStreamResponse } from "@api/mock/responses/search";
import { beforeEach, describe, expect, it } from "vitest";

import { useSearchAnswerStore } from ".";

const { conversationId, questionMessageId, answerMessageId, deltas } =
  searchAnswerStreamResponse;

const question = "DB는 뭘로 정했어?";

const accepted = {
  event: "accepted" as const,
  data: new SearchStreamAcceptedDto({
    conversationId,
    questionMessageId,
    answerMessageId,
  }),
};

const delta = {
  event: "delta" as const,
  data: new SearchStreamDeltaDto({ answerMessageId, text: deltas[0] }),
};

const startQuestion = () => {
  const controller = useSearchAnswerStore
    .getState()
    .start({ question, conversationId: null });
  if (!controller) throw new Error("질문을 시작하지 못했어요");

  return controller;
};

describe("searchAnswerStore", () => {
  beforeEach(() => {
    useSearchAnswerStore.getState().abort();
  });

  it("[SEARCH-R6] 접수 대기·생성 중에는 새 질문을 시작하지 않는다", () => {
    const controller = startQuestion();
    useSearchAnswerStore.getState().applyEvent(controller, accepted);

    expect(
      useSearchAnswerStore
        .getState()
        .start({ question: "다른 질문", conversationId: null }),
    ).toBeNull();
    expect(useSearchAnswerStore.getState().question).toBe(question);
  });

  it("[SEARCH-R4] accepted 전에 실패하면 질문을 지우고 접수 전 실패였다고 알린다", () => {
    const controller = startQuestion();

    const isAcceptFailed = useSearchAnswerStore
      .getState()
      .fail(controller, new Error("409"));

    const state = useSearchAnswerStore.getState();
    expect(isAcceptFailed).toBe(true);
    expect(state.status).toBe("IDLE");
    expect(state.question).toBe("");
  });

  it("[SEARCH-R5] accepted 뒤에 실패하면 받은 답변을 두고 실패 코드를 남긴다", () => {
    const controller = startQuestion();
    useSearchAnswerStore.getState().applyEvent(controller, accepted);
    useSearchAnswerStore.getState().applyEvent(controller, delta);

    const failed = new SearchStreamFailedDto({
      answerMessageId,
      status: "FAILED",
      code: "LLM_STREAM_FAILED",
    });
    const isAcceptFailed = useSearchAnswerStore
      .getState()
      .fail(controller, new SearchAnswerFailedError(failed));

    const state = useSearchAnswerStore.getState();
    expect(isAcceptFailed).toBe(false);
    expect(state.status).toBe("FAILED");
    expect(state.failedCode).toBe(failed.code);
    expect(state.text).toBe(delta.data.text);
  });

  it("[SEARCH-R8] 끊은 뒤 새 질문을 보내면 이전 요청의 늦은 이벤트·결과는 새 답변을 바꾸지 않는다", () => {
    const previous = startQuestion();
    useSearchAnswerStore.getState().abort();
    const current = startQuestion();

    useSearchAnswerStore.getState().applyEvent(previous, accepted);
    useSearchAnswerStore.getState().fail(previous, new Error("늦은 실패"));
    useSearchAnswerStore.getState().settle(previous, "COMPLETED");

    const state = useSearchAnswerStore.getState();
    expect(previous.signal.aborted).toBe(true);
    expect(state.controller).toBe(current);
    expect(state.status).toBe("SENDING");
    expect(state.question).toBe(question);
  });

  it("[SEARCH-R5] 실패한 답변을 다시 요청하면 접수 전부터 그 질문·답변 메시지 ID를 들고 접수 대기로 바꾼다", () => {
    const retryOf = { questionMessageId: 3, answerMessageId: 4 };

    const controller = useSearchAnswerStore.getState().start({
      question,
      conversationId,
      retryOf,
    });

    expect(controller).not.toBeNull();
    expect(useSearchAnswerStore.getState()).toMatchObject({
      status: "SENDING",
      question,
      conversationId,
      ...retryOf,
      text: "",
    });
  });

  it("[SEARCH-R5] 다시 요청한 답변이 accepted 전에 실패하면 처음 상태로 돌아가 저장된 실패 답변을 다시 보이게 한다", () => {
    const controller = useSearchAnswerStore.getState().start({
      question,
      conversationId,
      retryOf: { questionMessageId: 3, answerMessageId: 4 },
    });
    if (!controller) throw new Error("재시도를 시작하지 못했어요");

    useSearchAnswerStore.getState().fail(controller, new Error("409"));

    expect(useSearchAnswerStore.getState()).toMatchObject({
      status: "IDLE",
      questionMessageId: null,
      answerMessageId: null,
    });
  });

  it("완료되면 받은 답변을 두고 컨트롤러를 놓는다", () => {
    const controller = startQuestion();
    useSearchAnswerStore.getState().applyEvent(controller, accepted);
    useSearchAnswerStore.getState().applyEvent(controller, delta);

    useSearchAnswerStore.getState().settle(controller, "COMPLETED");

    const state = useSearchAnswerStore.getState();
    expect(state.status).toBe("COMPLETED");
    expect(state.text).toBe(delta.data.text);
    expect(state.controller).toBeNull();
  });
});
