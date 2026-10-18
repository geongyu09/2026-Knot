import { http } from "msw";
import { describe, expect, it } from "vitest";

import { PostRecordingRequestDto } from "@api/dto/recording";
import { mockServer } from "@api/mock/server";

import { startRecordingApi } from ".";

const WORKSPACE_ID = 1;
const RECORDINGS_PATH = "*/api/v1/workspaces/:workspaceId/recordings";

const START_INPUT = {
  requestId: "0b8e0c55-6f0a-4d0b-8f1e-2f6a8f3c9d10",
  tabId: "6f1c2a4e-1b2d-4c3e-9f80-1a2b3c4d5e6f",
  controlToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

/** 요청만 남기고 아무것도 돌려주지 않아 기본 mock 핸들러가 이어서 응답해요 */
const captureStartRequests = () => {
  const requests: Request[] = [];
  mockServer.use(
    http.post(RECORDINGS_PATH, ({ request }) => {
      requests.push(request.clone());
    }),
  );

  return requests;
};

// 본문 모양은 뮤테이션 훅이 만드는 요청 DTO가 정하므로, 그 DTO를 그대로 보내 확인해요
describe("startRecordingApi", () => {
  it("audioMode를 생략하면 본문에 그 키가 없어 기존 WebM 녹음 시작과 같은 요청이 나간다", async () => {
    const requests = captureStartRequests();

    await startRecordingApi({
      workspaceId: WORKSPACE_ID,
      body: new PostRecordingRequestDto(START_INPUT),
    });

    const [request] = requests;
    const body = await request.json();
    expect(body).toEqual(START_INPUT);
    expect(body).not.toHaveProperty("audioMode");
  });

  it("audioMode를 주면 본문에 그대로 싣는다", async () => {
    const requests = captureStartRequests();

    await startRecordingApi({
      workspaceId: WORKSPACE_ID,
      body: new PostRecordingRequestDto({
        ...START_INPUT,
        audioMode: "PCM16_CHUNKS_V1",
      }),
    });

    const [request] = requests;
    expect(await request.json()).toEqual({
      ...START_INPUT,
      audioMode: "PCM16_CHUNKS_V1",
    });
  });
});
