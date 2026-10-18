import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  PostRecordingEndRequestDto,
  RecordingEndAudioSaveDto,
} from "@api/dto/recording";
import { recordingEndResponse } from "@api/mock/responses/recording";
import { mockServer } from "@api/mock/server";

import { endRecordingApi } from ".";

const WORKSPACE_ID = 1;
const RECORDING_ID = 10;
const END_PATH = "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/end";

const CONTROL_PROOF = {
  tabId: "6f1c2a4e-1b2d-4c3e-9f80-1a2b3c4d5e6f",
  controlToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

// BE 문서의 예시 봉인이에요. 이미 예약한 1번(80,000프레임) 뒤에 1,600프레임 tail 조각을 더해요
const AUDIO_SEAL = {
  lastSequence: 2,
  totalFrameCount: 81600,
  pendingDescriptors: [
    {
      sequence: 2,
      sampleOffset: 80000,
      frameCount: 1600,
      byteLength: 3200,
      checksumSha256: "WjEigd9L2N+7TUqUrQv0TQG7jPztEga5DiG0ygVozbE=",
    },
  ],
};

/** 요청만 남기고 아무것도 돌려주지 않아 기본 mock 핸들러가 이어서 응답해요 */
const captureEndRequests = () => {
  const requests: Request[] = [];
  mockServer.use(
    http.post(END_PATH, ({ request }) => {
      requests.push(request.clone());
    }),
  );

  return requests;
};

// 본문 모양은 뮤테이션 훅이 만드는 요청 DTO가 정하므로, 그 DTO를 그대로 보내 확인해요
describe("endRecordingApi", () => {
  it("audioSeal을 생략하면 본문에 그 키가 없어 기존 WebM 녹음 종료와 같은 요청이 나간다", async () => {
    const requests = captureEndRequests();

    await endRecordingApi({
      workspaceId: WORKSPACE_ID,
      recordingId: RECORDING_ID,
      body: new PostRecordingEndRequestDto(CONTROL_PROOF),
    });

    const [request] = requests;
    const body = await request.json();
    expect(body).toEqual(CONTROL_PROOF);
    expect(body).not.toHaveProperty("audioSeal");
  });

  it("audioSeal을 주면 마지막 번호·전체 프레임·남은 descriptor를 본문에 중첩해 싣는다", async () => {
    const requests = captureEndRequests();

    await endRecordingApi({
      workspaceId: WORKSPACE_ID,
      recordingId: RECORDING_ID,
      body: new PostRecordingEndRequestDto({
        ...CONTROL_PROOF,
        audioSeal: AUDIO_SEAL,
      }),
    });

    const [request] = requests;
    expect(await request.json()).toEqual({
      ...CONTROL_PROOF,
      audioSeal: AUDIO_SEAL,
    });
  });

  it("PCM 녹음의 종료 응답은 audioSave의 저장 상태와 받아 주는 시한만 담고, 없으면 null이다", async () => {
    const acceptUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const audioSave = {
      audioSaveStatus: "DRAINING",
      expectedLastSequence: 2,
      totalFrameCount: 81600,
      tailUnknown: false,
      acceptUntil,
    };

    // 기본 mock은 WebM 종료라 audioSave가 없어요
    await expect(
      endRecordingApi({
        workspaceId: WORKSPACE_ID,
        recordingId: RECORDING_ID,
        body: new PostRecordingEndRequestDto(CONTROL_PROOF),
      }),
    ).resolves.toMatchObject({ audioSave: null });

    mockServer.use(
      http.post(END_PATH, () =>
        HttpResponse.json({ ...recordingEndResponse, audioSave }),
      ),
    );

    await expect(
      endRecordingApi({
        workspaceId: WORKSPACE_ID,
        recordingId: RECORDING_ID,
        body: new PostRecordingEndRequestDto({
          ...CONTROL_PROOF,
          audioSeal: AUDIO_SEAL,
        }),
      }),
    ).resolves.toMatchObject({
      audioSave: new RecordingEndAudioSaveDto({
        audioSaveStatus: "DRAINING",
        acceptUntil,
      }),
    });
  });
});
