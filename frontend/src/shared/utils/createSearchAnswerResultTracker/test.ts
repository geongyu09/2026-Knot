import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSearchAnswerResultTracker } from ".";

vi.mock("@utils/captureAnalyticsEvent", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

const SENT_AT = new Date("2026-10-19T03:00:00.000Z").getTime();

describe("createSearchAnswerResultTracker", () => {
  afterEach(() => {
    vi.mocked(captureAnalyticsEvent).mockClear();
    vi.useRealTimers();
  });

  it.each([
    { outcome: "COMPLETED", result: "completed" },
    { outcome: "STOPPED", result: "stopped" },
    { outcome: "FAILED", result: "failed" },
    { outcome: "ACCEPT_FAILED", result: "accept_failed" },
  ] as const)(
    "$outcome으로 끝나면 $result와 질문 글, 끝날 때의 답변 글, 만든 뒤 걸린 시간(0.1초 단위)을 보낸다",
    ({ outcome, result }) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(SENT_AT);
      let answer = "";
      const trackAnswerResult = createSearchAnswerResultTracker({
        question: "지난주에 정한 DB는?",
        isRetry: true,
        isFirstQuestion: false,
        getAnswer: () => answer,
      });

      answer = "PostgreSQL이에요";
      vi.setSystemTime(SENT_AT + 12_340);
      trackAnswerResult(outcome);

      expect(captureAnalyticsEvent).toHaveBeenCalledWith({
        event: "search_answer_result",
        properties: {
          result,
          is_retry: true,
          is_first_question: false,
          answer_seconds: 12.3,
          question: "지난주에 정한 DB는?",
          answer: "PostgreSQL이에요",
        },
      });
    },
  );

  it("만들기만 하고 끝나지 않으면 보내지 않는다", () => {
    createSearchAnswerResultTracker({
      question: "지난주에 정한 DB는?",
      isRetry: false,
      isFirstQuestion: true,
      getAnswer: () => "",
    });

    expect(captureAnalyticsEvent).not.toHaveBeenCalled();
  });
});
