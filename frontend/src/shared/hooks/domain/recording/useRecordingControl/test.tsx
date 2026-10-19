import { createHttpError, HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { ThemeProvider } from "@emotion/react";
import { DialogProvider } from "@provider/context/dialogContext";
import { theme } from "@provider/themeProvider";
import { useRecordingStore } from "@store/recordingStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  clearRecordingStartProof,
  getRecordingControlProof,
  getRecordingStartProof,
} from "@utils/recordingControlProof";
import { http, HttpResponse, type PathParams } from "msw";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PostRecordingEndResponseDto,
  type PostRecordingEndRequestDto,
} from "@api/dto/recording";
import {
  recordingAudioChunkCompleteResponse,
  recordingAudioChunkReserveResponse,
  recordingEndResponse,
  recordingHeartbeatResponse,
  recordingPauseResponse,
  recordingResumeResponse,
  recordingStartResponse,
} from "@api/mock/responses/recording";
import { mockServer } from "@api/mock/server";
import {
  type PcmCollectorParams,
  UnsupportedPcmCollectorError,
} from "@store/recordingStore/pcmCollector";

import useRecordingControl from ".";

const hoisted = vi.hoisted(() => {
  /** 수집기 호출과 서버 요청을 한 줄에 모아 순서를 봐요 */
  const events: string[] = [];

  /** 조각 하나의 프레임 수(5초) */
  const CHUNK_FRAMES = 80_000;

  /** 종료 요청은 가짜 타이머 아래에서 실패를 주입하기 위해 네트워크 대신 함수로 바꿔요 */
  const endRecordingApi =
    vi.fn<
      (params: {
        body: PostRecordingEndRequestDto;
      }) => Promise<PostRecordingEndResponseDto>
    >();

  /**
   * 실제 AudioWorklet 대신 쓰는 수집기. `feed`로 소리가 들어온 것처럼 프레임을 더하고,
   * `lose`로 마이크 트랙이 끝나거나 processor가 죽은 것처럼 알려요
   */
  class FakePcmCollector {
    static instances: FakePcmCollector[] = [];

    isCollecting = false;
    isLive = true;
    isClosed = false;
    private frames = 0;

    private constructor(private readonly params: PcmCollectorParams) {}

    static async create(params: PcmCollectorParams) {
      const collector = new FakePcmCollector(params);
      FakePcmCollector.instances.push(collector);

      return collector;
    }

    start() {
      this.isCollecting = true;
      events.push("start");
    }

    async flush() {
      events.push("flush");
      this.isCollecting = false;
      if (this.frames > 0) {
        this.params.onChunk(new ArrayBuffer(this.frames * 2));
        this.frames = 0;
      }
    }

    close() {
      this.isClosed = true;
    }

    feed(frames: number) {
      if (!this.isCollecting) return;

      this.frames += frames;
      while (this.frames >= CHUNK_FRAMES) {
        this.params.onChunk(new ArrayBuffer(CHUNK_FRAMES * 2));
        this.frames -= CHUNK_FRAMES;
      }
    }

    lose() {
      this.isLive = false;
      this.params.onLost();
    }
  }

  return { events, CHUNK_FRAMES, FakePcmCollector, endRecordingApi };
});
const { events, CHUNK_FRAMES, FakePcmCollector, endRecordingApi } = hoisted;

// 이 파일은 PCM 경로를 보므로 기본값과 상관없이 PCM으로 고정해요
vi.mock("@constants/recording", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@constants/recording")>()),
  RECORDING_AUDIO_MODE: "PCM16_CHUNKS_V1",
}));

// vi.mock은 파일 맨 위로 올라가 아래 구조 분해보다 먼저 실행되므로 hoisted 객체로 읽어요
vi.mock("@store/recordingStore/pcmCollector", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@store/recordingStore/pcmCollector")
  >()),
  default: hoisted.FakePcmCollector,
}));

vi.mock(
  "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/end",
  () => ({ endRecordingApi: hoisted.endRecordingApi }),
);

const WORKSPACE_ID = 1;
const RECORDING_ID = 10;
const START_PATH = "*/api/v1/workspaces/:workspaceId/recordings";
const RECORDING_PATH =
  "*/api/v1/workspaces/:workspaceId/recordings/:recordingId";
const RESERVE_PATH = `${RECORDING_PATH}/audio-chunks`;
/** BE 문서 예시: 3,200바이트(1,600프레임) 무음 PCM의 SHA-256 */
const SHORT_SILENCE_FRAMES = 1_600;
const SHORT_SILENCE_CHECKSUM = "WjEigd9L2N+7TUqUrQv0TQG7jPztEga5DiG0ygVozbE=";
/** 5초 무음 조각의 SHA-256. mock 예약 응답의 PUT 헤더와 같은 값이에요 */
const SILENT_CHUNK_CHECKSUM =
  recordingAudioChunkReserveResponse.requiredHeaders["x-amz-checksum-sha256"];
const EMPTY_SEAL = {
  lastSequence: 0,
  totalFrameCount: 0,
  pendingDescriptors: [],
};
const endedRecordingError = (code: string) =>
  createHttpError({ type: HTTP_ERROR_TYPE.conflict, code });

interface StartBody {
  requestId: string;
  audioMode?: string;
}

/** 조각 예약 요청 본문. 최초 탭 증명과 descriptor가 한 단계에 평평하게 담겨요 */
interface ReserveBody {
  tabId: string;
  controlToken: string;
  sequence: number;
  sampleOffset: number;
  frameCount: number;
  byteLength: number;
  checksumSha256: string;
}

const renderRecordingControl = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <DialogProvider>
          <MemoryRouter>{children}</MemoryRouter>
        </DialogProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );

  return renderHook(() => useRecordingControl(), { wrapper }).result;
};

/** 서버 요청을 경로의 마지막 마디로 `events`에 함께 모아요. 조각 PUT은 번호라 `put`으로 적고, 첫 요청 앞의 CSRF 토큰 조회는 빼요 */
const collectRequests = () => {
  mockServer.events.on("request:start", ({ request }) => {
    const last = new URL(request.url).pathname.split("/").pop() ?? "";
    if (last === "csrf") return;

    events.push(request.method === "PUT" ? "put" : last);
  });
};

/** 시작 요청 본문만 남기고 응답은 기본 mock 핸들러에 맡겨요 */
const recordStartBodies = () => {
  const bodies: StartBody[] = [];
  mockServer.use(
    http.post<PathParams, StartBody>(START_PATH, async ({ request }) => {
      bodies.push(await request.clone().json());
    }),
  );

  return bodies;
};

/** 시작 요청을 차례로 응답해요. 응답이 떨어지면 기본 mock 응답으로 돌아가요. `recordStartBodies`보다 먼저 불러요 */
const respondStart = (...responses: (() => Response)[]) =>
  mockServer.use(http.post(START_PATH, () => responses.shift()?.()));

const conflict = (code: string) => () =>
  HttpResponse.json({ code }, { status: 409 });

const endedSession = () =>
  HttpResponse.json({ ...recordingStartResponse, status: "ENDED" });

const recordReserveBodies = () => {
  const bodies: ReserveBody[] = [];
  mockServer.use(
    http.post<PathParams, ReserveBody>(RESERVE_PATH, async ({ request }) => {
      bodies.push(await request.clone().json());
    }),
  );

  return bodies;
};

const HELD_RESPONSES = {
  pause: [`${RECORDING_PATH}/pause`, recordingPauseResponse],
  resume: [`${RECORDING_PATH}/resume`, recordingResumeResponse],
  reserve: [RESERVE_PATH, recordingAudioChunkReserveResponse],
  complete: [
    `${RESERVE_PATH}/:sequence/complete`,
    recordingAudioChunkCompleteResponse,
  ],
} as const;

/** 응답을 붙잡아 뒀다가 `respond`를 부를 때 차례로 열어 줘요 */
const holdResponses = (action: keyof typeof HELD_RESPONSES) => {
  const waiting: (() => void)[] = [];
  const [path, response] = HELD_RESPONSES[action];
  mockServer.use(
    http.post(path, async () => {
      await new Promise<void>((resolve) => waiting.push(resolve));

      return HttpResponse.json(response);
    }),
  );

  return { respond: () => waiting.shift()?.() };
};

/** 열어 준 응답이 큐까지 흘러갈 시간을 줘요 */
const flushRequests = () => new Promise((resolve) => setTimeout(resolve, 50));

const startRecording = async (
  result: ReturnType<typeof renderRecordingControl>,
) => {
  await act(async () => {
    await result.current.startRecording(WORKSPACE_ID);
  });

  return FakePcmCollector.instances[0];
};

/** 시작 결과(`started`, `refused` 등)를 돌려줘요 */
const startRecordingOutcome = async (
  result: ReturnType<typeof renderRecordingControl>,
) => {
  let outcome: Awaited<ReturnType<typeof result.current.startRecording>>;
  await act(async () => {
    outcome = await result.current.startRecording(WORKSPACE_ID);
  });

  return outcome!;
};

const getSessionAudioMode = () =>
  useRecordingStore.getState().session?.audioMode;

const pauseRecording = async (
  result: ReturnType<typeof renderRecordingControl>,
) => {
  await act(async () => {
    await result.current.pauseRecording();
  });
};

const endRecording = async (
  result: ReturnType<typeof renderRecordingControl>,
) => {
  let outcome: Awaited<
    ReturnType<typeof result.current.endRecordingWithoutConfirm>
  >;
  await act(async () => {
    outcome = await result.current.endRecordingWithoutConfirm();
  });

  return outcome!;
};

const getStatus = () => useRecordingStore.getState().status;
const isUploadingChunks = () => useRecordingStore.getState().isUploadingChunks;
const count = (name: string) => events.filter((e) => e === name).length;
/** 종료 요청 본문들. 가짜 종료 함수가 받은 순서대로예요 */
const endBodies = () => endRecordingApi.mock.calls.map(([{ body }]) => body);

describe("useRecordingControl의 PCM 조각 녹음", () => {
  afterEach(() => {
    useRecordingStore.getState().discardRecording();
    clearRecordingStartProof();
    mockServer.events.removeAllListeners();
    events.length = 0;
    FakePcmCollector.instances.length = 0;
    endRecordingApi.mockReset();
    vi.useRealTimers();
  });

  it("시작 요청에 audioMode를 보내고, 시작 응답을 받은 뒤 수집을 시작한다", async () => {
    collectRequests();
    const startBodies = recordStartBodies();
    const result = renderRecordingControl();

    const collector = await startRecording(result);

    expect(startBodies[0]).toMatchObject({ audioMode: "PCM16_CHUNKS_V1" });
    expect(useRecordingStore.getState().session).toEqual({
      workspaceId: WORKSPACE_ID,
      recordingId: RECORDING_ID,
      audioMode: "PCM16_CHUNKS_V1",
    });
    expect(events).toEqual(["recordings", "start"]);
    expect(collector.isCollecting).toBe(true);
  });

  describe("WebM으로 돌아가기", () => {
    it("서버가 조각 저장을 꺼 뒀으면(409 AUDIO_MODE_DISABLED) 거절로 보지 않고, 수집기만 닫은 채 새 증명으로 WebM 녹음을 시작한다", async () => {
      const getUserMedia = vi.spyOn(navigator.mediaDevices, "getUserMedia");
      respondStart(conflict("AUDIO_MODE_DISABLED"));
      const startBodies = recordStartBodies();
      const result = renderRecordingControl();

      const outcome = await startRecordingOutcome(result);

      expect(outcome).toBe("started");
      expect(startBodies.map((body) => body.audioMode)).toEqual([
        "PCM16_CHUNKS_V1",
        undefined,
      ]);
      expect(startBodies[1].requestId).not.toBe(startBodies[0].requestId);
      expect(getSessionAudioMode()).toBe("FINAL_WEBM_V1");
      expect(getStatus()).toBe("recording");
      expect(getUserMedia).toHaveBeenCalledTimes(1);
      expect(FakePcmCollector.instances[0].isClosed).toBe(true);
    });

    it("끝난 녹음 뒤 새 증명으로 다시 보낸 시작이 AUDIO_MODE_DISABLED여도 WebM으로 시작한다", async () => {
      getRecordingStartProof();
      respondStart(endedSession, conflict("AUDIO_MODE_DISABLED"));
      const startBodies = recordStartBodies();
      const result = renderRecordingControl();

      const outcome = await startRecordingOutcome(result);

      expect(outcome).toBe("started");
      expect(startBodies.map((body) => body.audioMode)).toEqual([
        "PCM16_CHUNKS_V1",
        "PCM16_CHUNKS_V1",
        undefined,
      ]);
      expect(getSessionAudioMode()).toBe("FINAL_WEBM_V1");
    });

    it("WebM으로 다시 보낸 시작이 거절되면 지금처럼 거절로 돌려준다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      respondStart(
        conflict("AUDIO_MODE_DISABLED"),
        conflict("ACTIVE_RECORDING_ALREADY_EXISTS"),
      );
      const result = renderRecordingControl();

      expect(await startRecordingOutcome(result)).toBe("refused");
      expect(getStatus()).toBe("idle");
    });

    it("16kHz 수집기를 만들 수 없는 브라우저면 받아 둔 마이크로 WebM 녹음을 시작하고, 다음 시작은 다시 PCM부터 시도한다", async () => {
      vi.spyOn(FakePcmCollector, "create").mockRejectedValueOnce(
        new UnsupportedPcmCollectorError(),
      );
      const getUserMedia = vi.spyOn(navigator.mediaDevices, "getUserMedia");
      const startBodies = recordStartBodies();
      const result = renderRecordingControl();

      const outcome = await startRecordingOutcome(result);

      expect(outcome).toBe("started");
      expect(startBodies).toHaveLength(1);
      expect(startBodies[0]).not.toHaveProperty("audioMode");
      expect(getSessionAudioMode()).toBe("FINAL_WEBM_V1");
      expect(getUserMedia).toHaveBeenCalledTimes(1);
      expect(useRecordingStore.getState().analyser).not.toBeNull();

      useRecordingStore.getState().discardRecording();
      await startRecordingOutcome(result);

      expect(startBodies[1]).toMatchObject({ audioMode: "PCM16_CHUNKS_V1" });
      expect(getSessionAudioMode()).toBe("PCM16_CHUNKS_V1");
    });
  });

  describe("켜기 전 WebM으로 만든 증명이 남은 경우", () => {
    it("409 AUDIO_MODE_CONFLICT면 새 증명으로 한 번 더 PCM 시작을 요청한다", async () => {
      const leftoverRequestId = getRecordingStartProof().requestId;
      respondStart(conflict("AUDIO_MODE_CONFLICT"));
      const startBodies = recordStartBodies();
      const result = renderRecordingControl();

      const outcome = await startRecordingOutcome(result);

      expect(outcome).toBe("started");
      expect(startBodies.map((body) => body.audioMode)).toEqual([
        "PCM16_CHUNKS_V1",
        "PCM16_CHUNKS_V1",
      ]);
      expect(startBodies[0].requestId).toBe(leftoverRequestId);
      expect(startBodies[1].requestId).not.toBe(leftoverRequestId);
      expect(getSessionAudioMode()).toBe("PCM16_CHUNKS_V1");
    });

    it("옛 녹음이 살아 있어 다시 보낸 시작도 409면 거절로 돌려주고 더 보내지 않는다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      getRecordingStartProof();
      respondStart(
        conflict("AUDIO_MODE_CONFLICT"),
        conflict("ACTIVE_RECORDING_ALREADY_EXISTS"),
        conflict("AUDIO_MODE_CONFLICT"),
      );
      const startBodies = recordStartBodies();
      const result = renderRecordingControl();

      expect(await startRecordingOutcome(result)).toBe("refused");
      expect(startBodies).toHaveLength(2);
      expect(getStatus()).toBe("idle");
    });
  });

  it("일시정지는 남은 소리를 봉인해 큐에 넣은 뒤 서버에 알리고, 조각은 세션과 최초 탭 증명을 실어 올린다", async () => {
    collectRequests();
    const reserveBodies = recordReserveBodies();
    const result = renderRecordingControl();
    const collector = await startRecording(result);
    collector.feed(SHORT_SILENCE_FRAMES);

    await pauseRecording(result);

    expect(getStatus()).toBe("paused");
    expect(events.indexOf("flush")).toBeLessThan(events.indexOf("pause"));
    await waitFor(() => expect(events).toContain("complete"));
    expect(reserveBodies).toEqual([
      {
        ...getRecordingControlProof(),
        sequence: 1,
        sampleOffset: 0,
        frameCount: SHORT_SILENCE_FRAMES,
        byteLength: SHORT_SILENCE_FRAMES * 2,
        checksumSha256: SHORT_SILENCE_CHECKSUM,
      },
    ]);
  });

  it("이어서 녹음은 서버 재개가 성공한 뒤에 수집을 이어 가고, 일시정지 중에 들어온 소리로는 조각을 만들지 않는다", async () => {
    collectRequests();
    const reserveBodies = recordReserveBodies();
    const { respond } = holdResponses("resume");
    const result = renderRecordingControl();
    const collector = await startRecording(result);
    collector.feed(SHORT_SILENCE_FRAMES);
    await pauseRecording(result);

    collector.feed(80_000);
    act(() => void result.current.resumeRecording());
    await waitFor(() => expect(events).toContain("resume"));

    expect(getStatus()).toBe("paused");
    expect(collector.isCollecting).toBe(false);

    respond();
    await waitFor(() => expect(getStatus()).toBe("recording"));
    collector.feed(80_000);
    await waitFor(() => expect(reserveBodies).toHaveLength(2));

    expect(collector.isCollecting).toBe(true);
    expect(
      reserveBodies.map(({ sequence, sampleOffset }) => [
        sequence,
        sampleOffset,
      ]),
    ).toEqual([
      [1, 0],
      [2, SHORT_SILENCE_FRAMES],
    ]);
  });

  it("일시정지와 이어서 녹음을 연타해도 앞 요청의 응답을 받은 뒤 다음을 처리한다", async () => {
    collectRequests();
    const { respond } = holdResponses("pause");
    const result = renderRecordingControl();
    await startRecording(result);
    const results: boolean[] = [];

    act(() => {
      void result.current.pauseRecording();
      void result.current.resumeRecording().then((isResumed) => {
        results.push(isResumed);
      });
      void result.current.pauseRecording();
    });
    await waitFor(() => expect(events).toContain("pause"));

    // 첫 일시정지의 응답 전이라 이어서 녹음은 아직 보내지 않아요
    expect(events).toEqual(["recordings", "start", "flush", "pause"]);

    respond();
    await waitFor(() =>
      expect(events.filter((e) => e === "pause")).toHaveLength(2),
    );
    respond();
    await waitFor(() => expect(results).toEqual([true]));

    expect(events).toEqual([
      "recordings",
      "start",
      "flush",
      "pause",
      "resume",
      "start",
      "flush",
      "pause",
    ]);
    expect(getStatus()).toBe("paused");
  });

  it("수집기가 멈추면 저절로 일시정지하고, 이어서 녹음하면 마이크와 수집기를 다시 받은 뒤 서버 재개 뒤에 이어 간다", async () => {
    collectRequests();
    const getUserMedia = vi.spyOn(navigator.mediaDevices, "getUserMedia");
    const result = renderRecordingControl();
    const collector = await startRecording(result);

    act(() => collector.lose());

    expect(getStatus()).toBe("paused");
    expect(useRecordingStore.getState().isMicrophoneLost).toBe(true);
    expect(events).toEqual(["recordings", "start", "flush"]);

    // 독은 끊김을 보면 서버에 일시정지를 알린 뒤 다시 시도로 이어서 녹음해요
    act(() => void result.current.syncPause());
    act(() => void result.current.resumeRecording());
    await waitFor(() => expect(getStatus()).toBe("recording"));

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(FakePcmCollector.instances).toHaveLength(2);
    expect(collector.isClosed).toBe(true);
    expect(FakePcmCollector.instances[1].isCollecting).toBe(true);
    expect(events).toEqual([
      "recordings",
      "start",
      "flush",
      "pause",
      "resume",
      "start",
    ]);
  });

  describe("끝내기", () => {
    const endResponse = () =>
      new PostRecordingEndResponseDto(recordingEndResponse);

    it("마지막 조각을 봉인하고 예약 응답을 기다리는 조각까지 audioSeal에 담아 끝낸 뒤, 남은 조각을 올리는 동안 새 녹음을 열지 않는다", async () => {
      collectRequests();
      const { respond } = holdResponses("reserve");
      endRecordingApi.mockResolvedValue(endResponse());
      const result = renderRecordingControl();
      const collector = await startRecording(result);
      collector.feed(CHUNK_FRAMES);
      await waitFor(() => expect(count("audio-chunks")).toBe(1));
      collector.feed(SHORT_SILENCE_FRAMES);
      const proof = getRecordingControlProof();

      expect(await endRecording(result)).toBe("uploaded");

      expect(endBodies()).toEqual([
        {
          ...proof,
          audioSeal: {
            lastSequence: 2,
            totalFrameCount: CHUNK_FRAMES + SHORT_SILENCE_FRAMES,
            pendingDescriptors: [
              {
                sequence: 1,
                sampleOffset: 0,
                frameCount: CHUNK_FRAMES,
                byteLength: CHUNK_FRAMES * 2,
                checksumSha256: SILENT_CHUNK_CHECKSUM,
              },
              {
                sequence: 2,
                sampleOffset: CHUNK_FRAMES,
                frameCount: SHORT_SILENCE_FRAMES,
                byteLength: SHORT_SILENCE_FRAMES * 2,
                checksumSha256: SHORT_SILENCE_CHECKSUM,
              },
            ],
          },
        },
      ]);
      expect(useRecordingStore.getState()).toMatchObject({
        status: "idle",
        session: null,
        isUploadingChunks: true,
      });
      expect(await result.current.startRecording(WORKSPACE_ID)).toBe(
        "uploading",
      );

      // 종료 뒤에도 봉인에 담은 조각은 평소대로 예약부터 올려요
      respond();
      await waitFor(() => expect(count("audio-chunks")).toBe(2));
      respond();
      await waitFor(() => expect(isUploadingChunks()).toBe(false));
      expect(count("complete")).toBe(2);
      expect(count("recordings")).toBe(1);
    });

    it("음성이 없으면 lastSequence 0과 빈 목록의 audioSeal로 끝내고 바로 올리기를 마친다", async () => {
      endRecordingApi.mockResolvedValue(endResponse());
      const result = renderRecordingControl();
      await startRecording(result);
      const proof = getRecordingControlProof();

      expect(await endRecording(result)).toBe("uploaded");

      expect(endBodies()).toEqual([{ ...proof, audioSeal: EMPTY_SEAL }]);
      await waitFor(() => expect(isUploadingChunks()).toBe(false));
    });

    it("일시정지 중에 끝내면 새 조각 없이 봉인만 보낸다", async () => {
      collectRequests();
      endRecordingApi.mockResolvedValue(endResponse());
      const result = renderRecordingControl();
      const collector = await startRecording(result);
      collector.feed(SHORT_SILENCE_FRAMES);
      await pauseRecording(result);
      await waitFor(() => expect(count("complete")).toBe(1));
      const proof = getRecordingControlProof();

      expect(await endRecording(result)).toBe("uploaded");

      expect(endBodies()).toEqual([
        {
          ...proof,
          audioSeal: {
            lastSequence: 1,
            totalFrameCount: SHORT_SILENCE_FRAMES,
            pendingDescriptors: [],
          },
        },
      ]);
      expect(count("audio-chunks")).toBe(1);
    });

    it("종료 응답을 못 받으면 같은 봉인으로 1, 2, 4, 4초 뒤 다시 보내고, 서버가 먼저 끝냈다고 답하면 끝낸 것으로 본다", async () => {
      const result = renderRecordingControl();
      await startRecording(result);
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const calledAt: number[] = [];
      endRecordingApi.mockImplementation(async () => {
        calledAt.push(Date.now());
        throw calledAt.length < 5
          ? createHttpError({ type: HTTP_ERROR_TYPE.network })
          : endedRecordingError("RECORDING_ALREADY_ENDED");
      });

      let ending!: ReturnType<typeof result.current.endRecordingWithoutConfirm>;
      act(() => {
        ending = result.current.endRecordingWithoutConfirm();
      });
      await vi.advanceTimersByTimeAsync(10_999);

      // 끝내는 중 표시를 유지해 확인 창과 생존 신호가 겹치지 않아요
      expect(useRecordingStore.getState().isEnding).toBe(true);
      expect(calledAt).toEqual([0, 1_000, 3_000, 7_000]);

      await vi.advanceTimersByTimeAsync(1);
      expect(await ending).toBe("notUploaded");
      expect(calledAt).toEqual([0, 1_000, 3_000, 7_000, 11_000]);
      expect(endBodies().map(({ audioSeal }) => audioSeal)).toEqual(
        Array<typeof EMPTY_SEAL>(5).fill(EMPTY_SEAL),
      );
      expect(useRecordingStore.getState()).toMatchObject({
        status: "idle",
        isEnding: false,
      });
    });

    it("서버가 먼저 끝낸 녹음은 예약한 조각만 마저 올리고, 예약하지 못한 조각은 서버 거절로 멈춘다", async () => {
      collectRequests();
      const { respond } = holdResponses("complete");
      endRecordingApi.mockRejectedValue(
        endedRecordingError("RECORDING_ALREADY_ENDED"),
      );
      const result = renderRecordingControl();
      const collector = await startRecording(result);
      collector.feed(CHUNK_FRAMES);
      await waitFor(() => expect(count("put")).toBe(1));
      // 종료 뒤의 새 예약은 서버가 거절해요
      mockServer.use(
        http.post(RESERVE_PATH, () =>
          HttpResponse.json(
            { code: "RECORDING_ALREADY_ENDED" },
            { status: 409 },
          ),
        ),
      );
      collector.feed(SHORT_SILENCE_FRAMES);

      expect(await endRecording(result)).toBe("notUploaded");

      // 1번은 예약 응답을 받았으니 봉인에는 2번만 담겨요
      expect(
        endBodies()[0].audioSeal?.pendingDescriptors.map((d) => d.sequence),
      ).toEqual([2]);
      expect(useRecordingStore.getState()).toMatchObject({
        status: "idle",
        isUploadingChunks: true,
      });
      respond();
      await waitFor(() => expect(isUploadingChunks()).toBe(false));
      expect(count("audio-chunks")).toBe(2);
      expect(count("put")).toBe(1);
      expect(count("complete")).toBe(1);
    });

    it("생존 신호가 서버가 끝낸 녹음이라 답하면 남은 소리를 봉인하지 않고 버리고, 예약한 조각만 마저 올린다", async () => {
      collectRequests();
      const { respond } = holdResponses("complete");
      mockServer.use(
        http.post(`${RECORDING_PATH}/heartbeat`, () =>
          HttpResponse.json({
            ...recordingHeartbeatResponse,
            status: "ENDED",
            endedAt: new Date().toISOString(),
            endReason: "CONNECTION_EXPIRED",
          }),
        ),
      );
      const result = renderRecordingControl();
      const collector = await startRecording(result);
      collector.feed(CHUNK_FRAMES);
      await waitFor(() => expect(count("put")).toBe(1));
      collector.feed(SHORT_SILENCE_FRAMES);

      await act(() => result.current.sendHeartbeat());

      expect(useRecordingStore.getState()).toMatchObject({
        status: "idle",
        session: null,
        isUploadingChunks: true,
      });
      expect(collector.isClosed).toBe(true);
      expect(events).not.toContain("flush");
      expect(endRecordingApi).not.toHaveBeenCalled();
      respond();
      await waitFor(() => expect(isUploadingChunks()).toBe(false));
      expect(count("audio-chunks")).toBe(1);
    });

    it.each([
      [
        "409 RECORDING_ALREADY_DISCARDED",
        endedRecordingError("RECORDING_ALREADY_DISCARDED"),
      ],
      [
        "403 WORKSPACE_ACCESS_DENIED",
        createHttpError({
          type: HTTP_ERROR_TYPE.forbidden,
          code: "WORKSPACE_ACCESS_DENIED",
        }),
      ],
      ["404", createHttpError({ type: HTTP_ERROR_TYPE.notFound })],
      [
        "그 밖의 4xx",
        createHttpError({
          type: HTTP_ERROR_TYPE.badRequest,
          code: "INVALID_REQUEST",
        }),
      ],
    ])(
      "종료가 %s로 거절되면 조각을 버리고 더는 올리지 않는다",
      async (_, error) => {
        collectRequests();
        const { respond } = holdResponses("reserve");
        endRecordingApi.mockRejectedValue(error);
        const result = renderRecordingControl();
        const collector = await startRecording(result);
        collector.feed(CHUNK_FRAMES);
        await waitFor(() => expect(count("audio-chunks")).toBe(1));

        expect(await endRecording(result)).toBe("notUploaded");

        expect(useRecordingStore.getState()).toMatchObject({
          status: "idle",
          isUploadingChunks: false,
        });
        respond();
        await flushRequests();
        expect(count("put")).toBe(0);
        expect(endRecordingApi).toHaveBeenCalledTimes(1);
      },
    );

    it("봉인이 거절되면 봉인 없이 한 번 더 끝낸다", async () => {
      endRecordingApi
        .mockRejectedValueOnce(endedRecordingError("AUDIO_SEAL_CONFLICT"))
        .mockResolvedValueOnce(endResponse());
      const result = renderRecordingControl();
      await startRecording(result);
      const proof = getRecordingControlProof();

      expect(await endRecording(result)).toBe("uploaded");

      expect(endBodies()).toEqual([
        { ...proof, audioSeal: EMPTY_SEAL },
        { ...proof, audioSeal: undefined },
      ]);
    });
  });
});
