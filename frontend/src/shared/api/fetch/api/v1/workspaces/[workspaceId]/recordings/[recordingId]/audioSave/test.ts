import { describe, expect, it } from "vitest";

import { recordingAudioSaveResponse } from "@api/mock/responses/recording";

import { getRecordingAudioSaveApi } from ".";

const WORKSPACE_ID = 1;
const RECORDING_ID = 10;

const PARAMS = { workspaceId: WORKSPACE_ID, recordingId: RECORDING_ID };

describe("getRecordingAudioSaveApi", () => {
  it("저장 상태와 함께 확인된 구간, 누락 구간, 품질, 재시도 가능 여부를 모두 담는다", async () => {
    await expect(getRecordingAudioSaveApi(PARAMS)).resolves.toMatchObject(
      recordingAudioSaveResponse,
    );
  });
});
