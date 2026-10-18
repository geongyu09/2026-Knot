import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { csrfTokenResponse } from "@api/mock/responses/auth";
import { recordingTranscriptionRetryResponse } from "@api/mock/responses/recording";
import { mockServer } from "@api/mock/server";

import { retryRecordingTranscriptionApi } from ".";

const RETRY_PATH =
  "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/transcription/retry";

// 전사에 실패한 mock 녹음이에요. 다른 녹음은 기본 핸들러가 다시 시도할 수 없다고 거절해요
const PARAMS = {
  workspaceId: 1,
  recordingId: recordingTranscriptionRetryResponse.recordingId,
};

describe("retryRecordingTranscriptionApi", () => {
  it("본문 없이 CSRF 헤더만 실어 POST로 보낸다", async () => {
    const requests: Request[] = [];
    // 요청만 남기고 아무것도 돌려주지 않아 기본 mock 핸들러가 이어서 응답해요
    mockServer.use(
      http.post(RETRY_PATH, ({ request }) => {
        requests.push(request.clone());
      }),
    );

    await retryRecordingTranscriptionApi(PARAMS);

    const [request] = requests;
    expect(request.headers.get("X-XSRF-TOKEN")).toBe(csrfTokenResponse.token);
    expect(await request.text()).toBe("");
  });

  it("접수한 전사 시도 ID와 전사 상태를 담는다", async () => {
    await expect(retryRecordingTranscriptionApi(PARAMS)).resolves.toMatchObject(
      recordingTranscriptionRetryResponse,
    );
  });

  it("다른 전사가 진행 중이면 409 TRANSCRIPTION_BUSY를 HttpError의 code로 넘긴다", async () => {
    mockServer.use(
      http.post(RETRY_PATH, () =>
        HttpResponse.json(
          {
            code: "TRANSCRIPTION_BUSY",
            message: "다른 전사가 진행 중입니다",
          },
          { status: 409 },
        ),
      ),
    );

    await expect(retryRecordingTranscriptionApi(PARAMS)).rejects.toMatchObject({
      type: HTTP_ERROR_TYPE.conflict,
      code: "TRANSCRIPTION_BUSY",
    });
  });
});
