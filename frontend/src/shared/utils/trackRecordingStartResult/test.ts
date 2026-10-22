import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { afterEach, describe, expect, it, vi } from "vitest";

import { trackRecordingStartResult } from ".";

vi.mock("@utils/captureAnalyticsEvent", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

describe("trackRecordingStartResult", () => {
  afterEach(() => {
    vi.mocked(captureAnalyticsEvent).mockClear();
  });

  it.each([
    { result: "started", expected: "started" },
    { result: "microphoneUnavailable", expected: "microphone_unavailable" },
    { result: "refused", expected: "refused" },
    { result: "networkFailed", expected: "network_failed" },
    { result: "failed", expected: "failed" },
    { result: "uploading", expected: "uploading" },
  ] as const)(
    "시작 결과가 $result면 $expected와 기다린 초를 보낸다",
    ({ result, expected }) => {
      trackRecordingStartResult({ workspaceId: 3, result, waitMs: 1834 });

      expect(captureAnalyticsEvent).toHaveBeenCalledWith({
        event: "recording_start_result",
        properties: { result: expected, wait_seconds: 1.8, workspace_id: 3 },
      });
    },
  );

  it("시작 중에 다시 눌러 무시됐으면(ignored) 보내지 않는다", () => {
    trackRecordingStartResult({ workspaceId: 3, result: "ignored", waitMs: 0 });

    expect(captureAnalyticsEvent).not.toHaveBeenCalled();
  });
});
