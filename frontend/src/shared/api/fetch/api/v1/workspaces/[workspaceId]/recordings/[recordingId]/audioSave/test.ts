import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { csrfTokenResponse } from "@api/mock/responses/auth";
import { recordingAudioSaveResponse } from "@api/mock/responses/recording";
import { mockServer } from "@api/mock/server";

import { getRecordingAudioSaveApi } from ".";
import { retryRecordingAudioSaveApi } from "./retry";

const WORKSPACE_ID = 1;
const RECORDING_ID = 10;
const RETRY_PATH =
  "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/audio-save/retry";

const PARAMS = { workspaceId: WORKSPACE_ID, recordingId: RECORDING_ID };

describe("getRecordingAudioSaveApi", () => {
  it("저장 상태와 함께 확인된 구간, 누락 구간, 품질, 재시도 가능 여부를 모두 담는다", async () => {
    await expect(getRecordingAudioSaveApi(PARAMS)).resolves.toMatchObject(
      recordingAudioSaveResponse,
    );
  });
});

describe("retryRecordingAudioSaveApi", () => {
  it("본문 없이 CSRF 헤더만 실어 POST로 보낸다", async () => {
    const requests: Request[] = [];
    // 요청만 남기고 아무것도 돌려주지 않아 기본 mock 핸들러가 이어서 응답해요
    mockServer.use(
      http.post(RETRY_PATH, ({ request }) => {
        requests.push(request.clone());
      }),
    );

    await retryRecordingAudioSaveApi(PARAMS);

    const [request] = requests;
    expect(request.headers.get("X-XSRF-TOKEN")).toBe(csrfTokenResponse.token);
    expect(await request.text()).toBe("");
  });

  it("다시 접수한 뒤의 저장 상태를 조회 응답과 같은 모양으로 담는다", async () => {
    await expect(retryRecordingAudioSaveApi(PARAMS)).resolves.toMatchObject(
      recordingAudioSaveResponse,
    );
  });

  it("다시 시도할 수 없는 저장이면 409 AUDIO_SAVE_RETRY_NOT_ALLOWED를 HttpError의 code로 넘긴다", async () => {
    mockServer.use(
      http.post(RETRY_PATH, () =>
        HttpResponse.json(
          {
            code: "AUDIO_SAVE_RETRY_NOT_ALLOWED",
            message: "현재 오디오 저장 작업은 다시 시도할 수 없습니다",
          },
          { status: 409 },
        ),
      ),
    );

    await expect(retryRecordingAudioSaveApi(PARAMS)).rejects.toMatchObject({
      type: HTTP_ERROR_TYPE.conflict,
      code: "AUDIO_SAVE_RETRY_NOT_ALLOWED",
    });
  });
});
