import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { afterEach, describe, expect, it, vi } from "vitest";

import { trackRecordingStartFailed } from ".";

vi.mock("@utils/captureAnalyticsEvent", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

const failure = {
  errorName: null,
  permissionBefore: "prompt",
  permissionAfter: "denied",
  attempt: 2,
  surface: "dock",
  workspaceId: 3,
} as const;

describe("trackRecordingStartFailed", () => {
  afterEach(() => {
    vi.mocked(captureAnalyticsEvent).mockClear();
  });

  it.each([
    { result: "microphoneUnavailable", expected: "microphone_unavailable" },
    { result: "refused", expected: "refused" },
    { result: "networkFailed", expected: "network_failed" },
  ] as const)(
    "시작하지 못한 결과가 $result면 이유 $expected와 권한 상태 · 횟수 · 위치 · id를 보낸다",
    ({ result, expected }) => {
      trackRecordingStartFailed({ ...failure, result });

      expect(captureAnalyticsEvent).toHaveBeenCalledWith({
        event: "recording_start_failed",
        properties: {
          reason: expected,
          permission_before: "prompt",
          permission_after: "denied",
          attempt: 2,
          surface: "dock",
          workspace_id: 3,
        },
      });
    },
  );

  it("마이크를 받지 못한 오류 이름이 있으면 함께 보낸다", () => {
    trackRecordingStartFailed({
      ...failure,
      result: "microphoneUnavailable",
      errorName: "NotFoundError",
      surface: "recorder_bar",
    });

    expect(captureAnalyticsEvent).toHaveBeenCalledWith({
      event: "recording_start_failed",
      properties: expect.objectContaining({
        reason: "microphone_unavailable",
        error_name: "NotFoundError",
        surface: "recorder_bar",
      }),
    });
  });

  it("오류 이름이 없으면 error_name을 빼고 보낸다", () => {
    trackRecordingStartFailed({ ...failure, result: "refused" });

    const [[{ properties }]] = vi.mocked(captureAnalyticsEvent).mock.calls;
    expect(properties).not.toHaveProperty("error_name");
  });
});
