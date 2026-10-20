import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { afterEach, describe, expect, it, vi } from "vitest";

import { trackRecordingEnded } from ".";

vi.mock("@utils/captureAnalyticsEvent", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

const session = {
  workspaceId: 3,
  recordingId: 7,
  audioMode: "PCM16_CHUNKS_V1",
} as const;

describe("trackRecordingEnded", () => {
  afterEach(() => {
    vi.mocked(captureAnalyticsEvent).mockClear();
  });

  it.each([
    { result: "uploaded", expected: "uploaded" },
    { result: "notUploaded", expected: "not_uploaded" },
  ] as const)(
    "끝낸 결과가 $result면 $expected와 녹음 방식 · id를 보낸다",
    ({ result, expected }) => {
      trackRecordingEnded({ ...session, result });

      expect(captureAnalyticsEvent).toHaveBeenCalledWith({
        event: "recording_ended",
        properties: {
          result: expected,
          audio_mode: "PCM16_CHUNKS_V1",
          recording_id: 7,
          workspace_id: 3,
        },
      });
    },
  );

  it("끝내지 못했으면(notEnded) 보내지 않는다", () => {
    trackRecordingEnded({ ...session, result: "notEnded" });

    expect(captureAnalyticsEvent).not.toHaveBeenCalled();
  });
});
