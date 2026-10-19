import { createHttpError, HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { captureRequestError } from "@provider/sentry";
import { setupSentryEvents } from "@provider/sentry/mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logRequestError } from ".";

describe("logRequestError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("동작 이름과 오류를 콘솔 에러로 남긴다", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = new Error("boom");

    logRequestError({ feature: "recording", action: "일시정지", error });

    expect(consoleError).toHaveBeenCalledWith(
      "일시정지 요청에 실패했어요",
      error,
    );
  });

  describe("Sentry 보고", () => {
    const { flushEvents } = setupSentryEvents();

    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("요청이 아닌 오류(녹음기 시작 예외 등)를 기능 이름을 붙여 한 번 보고한다", async () => {
      logRequestError({
        feature: "recording",
        action: "녹음 시작",
        error: new DOMException(
          "녹음기를 시작하지 못했어요",
          "InvalidStateError",
        ),
      });

      const events = await flushEvents();
      expect(events).toHaveLength(1);
      expect(events[0].tags).toMatchObject({
        source: "caught",
        feature: "recording",
      });
    });

    // 녹음 제어의 요청은 뮤테이션이라 실패가 MutationCache로 먼저 보고된 뒤 catch에 닿아요
    it("react-query가 이미 보낸 요청 오류는 콘솔에만 남기고 다시 보고하지 않는다", async () => {
      const error = createHttpError({ type: HTTP_ERROR_TYPE.serverError });

      captureRequestError({ error, source: "mutation" });
      logRequestError({ feature: "recording", action: "일시정지", error });

      const events = await flushEvents();
      expect(events).toHaveLength(1);
      expect(events[0].tags).toMatchObject({ source: "mutation" });
    });

    it("화면이 처리하는 예상 실패(409)는 보고하지 않는다", async () => {
      logRequestError({
        feature: "recording",
        action: "녹음 시작",
        error: createHttpError({ type: HTTP_ERROR_TYPE.conflict }),
      });

      expect(await flushEvents()).toHaveLength(0);
    });
  });
});
