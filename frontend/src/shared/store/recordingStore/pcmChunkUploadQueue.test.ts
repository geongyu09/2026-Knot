import { http, HttpResponse, type PathParams } from "msw";
import { describe, expect, it, vi } from "vitest";

import {
  reserveRecordingAudioChunkApi,
  uploadRecordingAudioChunkApi,
} from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/audioChunks";
import { completeRecordingAudioChunkApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/audioChunks/[sequence]/complete";
import {
  MOCK_AUDIO_STORAGE_ORIGIN,
  recordingAudioChunkCompleteResponse,
  recordingAudioChunkReserveResponse,
} from "@api/mock/responses/recording";
import { mockServer } from "@api/mock/server";
import type { RecordingAudioChunkReserveRequest } from "@api/mock/types/recording";

import PcmChunkUploadQueue from "./pcmChunkUploadQueue";

const SESSION = { workspaceId: 1, recordingId: 10 };
const CONTROL_PROOF = {
  tabId: "6f1c2a4e-1b2d-4c3e-9f80-1a2b3c4d5e6f",
  controlToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};
const RESERVE_PATH =
  "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/audio-chunks";
const COMPLETE_PATH = `${RESERVE_PATH}/:sequence/complete`;
const STORAGE_PATH = `${MOCK_AUDIO_STORAGE_ORIGIN}/*`;

/** 5초 조각의 프레임 수. 16kHz × 5초 */
const CHUNK_FRAMES = 80_000;
/** 5초 무음 PCM의 SHA-256(BE 문서 예시). mock 예약 응답의 PUT 헤더와 같은 값이에요 */
const SILENT_CHUNK_CHECKSUM =
  recordingAudioChunkReserveResponse.requiredHeaders["x-amz-checksum-sha256"];

const silentPcm = (frames: number) => new ArrayBuffer(frames * 2);

/** 열어 주기 전까지 응답을 붙잡아 두는 문 */
const createGate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });

  return { opened, open };
};

/** 실제 요청 함수를 주입한 큐. 도메인 훅이 뮤테이션의 mutateAsync를 넘기는 모양과 같아요 */
const createQueue = () =>
  new PcmChunkUploadQueue({
    reserve: (descriptor) =>
      reserveRecordingAudioChunkApi({
        ...SESSION,
        body: { ...CONTROL_PROOF, ...descriptor },
      }),
    upload: uploadRecordingAudioChunkApi,
    complete: (sequence) =>
      completeRecordingAudioChunkApi({
        ...SESSION,
        sequence,
        body: CONTROL_PROOF,
      }),
  });

describe("PcmChunkUploadQueue", () => {
  it("넣은 순서대로 번호·offset·해시를 고정하고, 앞 예약의 응답을 받은 뒤에 다음 예약을 보낸다", async () => {
    const firstReserve = createGate();
    const bodies: RecordingAudioChunkReserveRequest[] = [];
    mockServer.use(
      http.post<PathParams, RecordingAudioChunkReserveRequest>(
        RESERVE_PATH,
        async ({ request }) => {
          const body = await request.clone().json();
          bodies.push(body);
          if (body.sequence === 1) await firstReserve.opened;
        },
      ),
    );
    const queue = createQueue();

    const first = queue.enqueue(silentPcm(CHUNK_FRAMES));
    const second = queue.enqueue(silentPcm(1_600));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    // 두 번째 조각은 더 작아 해시가 먼저 끝나지만, 첫 예약의 응답 전에는 보내지 않아요
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bodies).toHaveLength(1);

    firstReserve.open();
    await Promise.all([first, second]);

    expect(bodies).toEqual([
      {
        ...CONTROL_PROOF,
        sequence: 1,
        sampleOffset: 0,
        frameCount: CHUNK_FRAMES,
        byteLength: CHUNK_FRAMES * 2,
        checksumSha256: SILENT_CHUNK_CHECKSUM,
      },
      {
        ...CONTROL_PROOF,
        sequence: 2,
        sampleOffset: CHUNK_FRAMES,
        frameCount: 1_600,
        byteLength: 3_200,
        checksumSha256: expect.any(String),
      },
    ]);
  });

  it("뒤 조각의 저장 확인이 먼저 와도 그 조각만 놓고, watermark는 응답 중 큰 값을 따른다", async () => {
    const firstComplete = createGate();
    mockServer.use(
      // 서버는 1번을 먼저 확인했지만(80,000) 그 응답이 2번 응답(160,000)보다 늦게 도착하는 상황이에요
      http.post(COMPLETE_PATH, async ({ params }) => {
        const sequence = Number(params.sequence);
        if (sequence === 1) await firstComplete.opened;

        return HttpResponse.json({
          ...recordingAudioChunkCompleteResponse,
          sequence,
          verifiedThroughFrame:
            sequence === 1 ? CHUNK_FRAMES : CHUNK_FRAMES * 2,
        });
      }),
    );
    const queue = createQueue();

    void queue.enqueue(silentPcm(CHUNK_FRAMES));
    const second = queue.enqueue(silentPcm(CHUNK_FRAMES));
    let isDrained = false;
    const drained = queue.drain().then(() => {
      isDrained = true;
    });

    await second;
    expect(queue.pendingSequences).toEqual([1]);
    expect(queue.verifiedThroughFrame).toBe(CHUNK_FRAMES * 2);
    expect(isDrained).toBe(false);

    firstComplete.open();
    await drained;

    expect(queue.pendingSequences).toEqual([]);
    expect(queue.verifiedThroughFrame).toBe(CHUNK_FRAMES * 2);
  });

  it("예약 응답이 이미 VERIFIED면 PUT 없이 저장 확인만 보내고 조각을 놓는다", async () => {
    let putCount = 0;
    let completeCount = 0;
    mockServer.use(
      http.post<PathParams, RecordingAudioChunkReserveRequest>(
        RESERVE_PATH,
        async ({ request }) => {
          const { sequence } = await request.json();

          return HttpResponse.json({
            sequence,
            status: "VERIFIED",
            uploadUrl: null,
            expiresAt: null,
            requiredHeaders: {},
          });
        },
      ),
      http.put(STORAGE_PATH, () => {
        putCount += 1;
      }),
      http.post(COMPLETE_PATH, () => {
        completeCount += 1;
      }),
    );
    const queue = createQueue();

    await queue.enqueue(silentPcm(CHUNK_FRAMES));

    expect(putCount).toBe(0);
    expect(completeCount).toBe(1);
    expect(queue.pendingSequences).toEqual([]);
    expect(queue.verifiedThroughFrame).toBe(
      recordingAudioChunkCompleteResponse.verifiedThroughFrame,
    );
  });
});
