import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { recordingDetailsResponse } from "@api/mock/responses/recording";
import { mockServer } from "@api/mock/server";

import { getRecordingApi } from ".";

const WORKSPACE_ID = 1;
const DETAIL_PATH = "*/api/v1/workspaces/:workspaceId/recordings/:recordingId";

const [{ recordingId, detail }] = recordingDetailsResponse;

describe("getRecordingApi", () => {
  it("sourceAudio를 주지 않는 서버의 응답은 원본 오디오 품질을 null로 맞춘다", async () => {
    await expect(
      getRecordingApi({ workspaceId: WORKSPACE_ID, recordingId }),
    ).resolves.toMatchObject({ sourceAudio: null });
  });

  it("PCM 조각 녹음의 원본 오디오 품질과 누락 구간을 담는다", async () => {
    const sourceAudio = {
      quality: "PARTIAL",
      missingRanges: [{ start: 80000, endExclusive: 160000 }],
      tailUnknown: true,
    } as const;
    mockServer.use(
      http.get(DETAIL_PATH, () =>
        HttpResponse.json({ ...detail, sourceAudio }),
      ),
    );

    await expect(
      getRecordingApi({ workspaceId: WORKSPACE_ID, recordingId }),
    ).resolves.toMatchObject({ sourceAudio });
  });
});
