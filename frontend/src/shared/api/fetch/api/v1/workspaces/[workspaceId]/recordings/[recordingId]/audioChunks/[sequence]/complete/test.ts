import { describe, expect, it } from "vitest";

import { recordingAudioChunkCompleteResponse } from "@api/mock/responses/recording";

import { completeRecordingAudioChunkApi } from ".";

describe("completeRecordingAudioChunkApi", () => {
  it("확인한 조각과 함께 연속 확인 번호, 프레임, 길이, 확인 시각을 모두 담는다", async () => {
    await expect(
      completeRecordingAudioChunkApi({
        workspaceId: 1,
        recordingId: 10,
        sequence: recordingAudioChunkCompleteResponse.sequence,
        body: {
          tabId: "6f1c2a4e-1b2d-4c3e-9f80-1a2b3c4d5e6f",
          controlToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        },
      }),
    ).resolves.toMatchObject(recordingAudioChunkCompleteResponse);
  });
});
