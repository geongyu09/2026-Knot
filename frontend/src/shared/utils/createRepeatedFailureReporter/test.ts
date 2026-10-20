import { createHttpError, HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { setupSentryEvents } from "@provider/sentry/mock";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRepeatedFailureReporter } from ".";

/** 시도마다 새로 만들어지는 실패. 같은 오류 객체를 다시 보내지 않는 SDK의 중복 방지에 걸리지 않아요 */
const serverError = () =>
  createHttpError({
    type: HTTP_ERROR_TYPE.serverError,
    code: "INTERNAL_SERVER_ERROR",
  });
const contractError = () =>
  createHttpError({
    type: HTTP_ERROR_TYPE.badRequest,
    code: "INVALID_REQUEST_BODY",
  });

const createReporter = () =>
  createRepeatedFailureReporter({
    feature: "recording",
    action: "녹음 생존 신호",
  });

describe("createRepeatedFailureReporter", () => {
  const { flushEvents } = setupSentryEvents();

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("같은 실패가 거듭되면 처음 한 번만 연속 실패 수와 함께 보내고, 콘솔에는 실패마다 남긴다", async () => {
    const { report } = createReporter();

    report({ error: serverError() });
    report({ error: serverError() });
    report({ error: serverError() });

    const events = await flushEvents();
    expect(events).toHaveLength(1);
    expect(events[0].tags).toMatchObject({
      source: "caught",
      feature: "recording",
    });
    expect(events[0].extra).toEqual({ consecutiveFailures: 1 });
    expect(console.error).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledWith(
      "녹음 생존 신호 요청에 실패했어요",
      expect.anything(),
    );
  });

  it("연속 실패 중 실패의 종류가 바뀌면 그 종류의 첫 실패도 보낸다", async () => {
    const { report } = createReporter();

    report({ error: serverError() });
    report({ error: serverError() });
    report({ error: contractError() });
    report({ error: contractError() });

    const events = await flushEvents();
    expect(events.map(({ extra }) => extra)).toEqual([
      { consecutiveFailures: 1 },
      { consecutiveFailures: 3 },
    ]);
  });

  it("끝내 포기한 실패는 이미 보낸 종류여도 보낸다", async () => {
    const { report } = createReporter();

    report({ error: serverError() });
    report({ error: serverError() });
    report({ error: serverError(), isGivingUp: true });

    const events = await flushEvents();
    expect(events.map(({ extra }) => extra)).toEqual([
      { consecutiveFailures: 1 },
      { consecutiveFailures: 3, isGivingUp: true },
    ]);
  });

  it("성공해 다시 세기 시작하면 같은 실패도 다시 보낸다", async () => {
    const { report, reset } = createReporter();

    report({ error: serverError() });
    reset();
    report({ error: serverError() });

    const events = await flushEvents();
    expect(events.map(({ extra }) => extra)).toEqual([
      { consecutiveFailures: 1 },
      { consecutiveFailures: 1 },
    ]);
  });

  it("실패를 세는 단위(녹음)가 바뀌면 새로 센다", async () => {
    const { report } = createReporter();

    report({ error: serverError(), scope: 1 });
    report({ error: serverError(), scope: 1 });
    report({ error: serverError(), scope: 2 });

    const events = await flushEvents();
    expect(events.map(({ extra }) => extra)).toEqual([
      { consecutiveFailures: 1 },
      { consecutiveFailures: 1 },
    ]);
  });
});
