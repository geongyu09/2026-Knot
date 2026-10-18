import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  PostRecordingAudioChunkRequestDto,
  PostRecordingAudioChunkResponseDto,
  type PostRecordingAudioChunkResponseRaw,
} from "@api/dto/recording";
import { HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { csrfTokenResponse } from "@api/mock/responses/auth";
import { recordingAudioChunkReserveResponse } from "@api/mock/responses/recording";
import { mockServer } from "@api/mock/server";

import { reserveRecordingAudioChunkApi } from ".";

const WORKSPACE_ID = 1;
const RECORDING_ID = 10;
const AUDIO_CHUNKS_PATH =
  "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/audio-chunks";

const CONTROL_PROOF = {
  tabId: "6f1c2a4e-1b2d-4c3e-9f80-1a2b3c4d5e6f",
  controlToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

// BE 문서의 예시 조각(5초 무음)이에요. checksum은 mock 예약 응답의 PUT 헤더와 같은 값이에요
const SILENT_CHUNK = {
  sequence: 1,
  sampleOffset: 0,
  frameCount: 80000,
  byteLength: 160000,
  checksumSha256:
    recordingAudioChunkReserveResponse.requiredHeaders["x-amz-checksum-sha256"],
};

const reserveSilentChunk = () =>
  reserveRecordingAudioChunkApi({
    workspaceId: WORKSPACE_ID,
    recordingId: RECORDING_ID,
    // 본문 모양은 뮤테이션 훅이 만드는 요청 DTO가 정하므로, 그 DTO를 그대로 보내 확인해요
    body: new PostRecordingAudioChunkRequestDto({
      ...CONTROL_PROOF,
      ...SILENT_CHUNK,
    }),
  });

/** 이번 테스트에서만 예약을 서버 오류로 응답하게 바꿔요 */
const respondReserveWithError = (status: number, code: string) =>
  mockServer.use(
    http.post(AUDIO_CHUNKS_PATH, () =>
      HttpResponse.json(
        { code, message: "요청을 처리하지 못했어요" },
        { status },
      ),
    ),
  );

describe("reserveRecordingAudioChunkApi", () => {
  it("증명과 descriptor를 한 단계에 담은 본문을 CSRF 헤더와 함께 POST로 보낸다", async () => {
    const requests: Request[] = [];
    // 요청만 남기고 아무것도 돌려주지 않아 기본 mock 핸들러가 이어서 응답해요
    mockServer.use(
      http.post(AUDIO_CHUNKS_PATH, ({ request }) => {
        requests.push(request.clone());
      }),
    );

    await reserveSilentChunk();

    const [request] = requests;
    expect(new URL(request.url).pathname).toBe(
      `/api/v1/workspaces/${WORKSPACE_ID}/recordings/${RECORDING_ID}/audio-chunks`,
    );
    expect(request.headers.get("X-XSRF-TOKEN")).toBe(csrfTokenResponse.token);
    expect(await request.json()).toEqual({ ...CONTROL_PROOF, ...SILENT_CHUNK });
  });

  it("이미 저장이 확인된 조각은 200 VERIFIED를 uploadUrl·expiresAt null과 빈 헤더 그대로 변환한다", async () => {
    const verified = {
      sequence: SILENT_CHUNK.sequence,
      status: "VERIFIED",
      uploadUrl: null,
      expiresAt: null,
      requiredHeaders: {},
    } satisfies PostRecordingAudioChunkResponseRaw;
    mockServer.use(
      http.post(AUDIO_CHUNKS_PATH, () => HttpResponse.json(verified)),
    );

    await expect(reserveSilentChunk()).resolves.toEqual(
      new PostRecordingAudioChunkResponseDto(verified),
    );
  });

  it("조각 번호를 건너뛰면 409 AUDIO_SEQUENCE_GAP을 HttpError의 code로 넘긴다", async () => {
    respondReserveWithError(409, "AUDIO_SEQUENCE_GAP");

    await expect(reserveSilentChunk()).rejects.toMatchObject({
      type: HTTP_ERROR_TYPE.conflict,
      code: "AUDIO_SEQUENCE_GAP",
    });
  });

  it("예약한 조각의 descriptor를 바꾸면 409 AUDIO_CHUNK_CONFLICT를 HttpError의 code로 넘긴다", async () => {
    respondReserveWithError(409, "AUDIO_CHUNK_CONFLICT");

    await expect(reserveSilentChunk()).rejects.toMatchObject({
      type: HTTP_ERROR_TYPE.conflict,
      code: "AUDIO_CHUNK_CONFLICT",
    });
  });
});
