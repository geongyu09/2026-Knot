import { ThemeProvider } from "@emotion/react";
import { DialogProvider } from "@provider/context/dialogContext";
import { theme } from "@provider/themeProvider";
import { useRecordingStore } from "@store/recordingStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  clearRecordingStartProof,
  getRecordingControlProof,
} from "@utils/recordingControlProof";
import { http, HttpResponse, type PathParams } from "msw";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  recordingPauseResponse,
  recordingResumeResponse,
} from "@api/mock/responses/recording";
import { mockServer } from "@api/mock/server";
import type { PcmCollectorParams } from "@store/recordingStore/pcmCollector";

import useRecordingControl from ".";

const { events, FakePcmCollector } = vi.hoisted(() => {
  /** 수집기 호출과 서버 요청을 한 줄에 모아 순서를 봐요 */
  const events: string[] = [];

  /** 조각 하나의 프레임 수(5초) */
  const CHUNK_FRAMES = 80_000;

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

  return { events, FakePcmCollector };
});

// PCM 켜기(#799) 전이라 기본값은 WebM이에요. 이 파일은 PCM 경로만 보므로 PCM으로 바꿔요
vi.mock("@constants/recording", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@constants/recording")>()),
  RECORDING_AUDIO_MODE: "PCM16_CHUNKS_V1",
}));

vi.mock("@store/recordingStore/pcmCollector", () => ({
  default: FakePcmCollector,
}));

const WORKSPACE_ID = 1;
const RECORDING_ID = 10;
const RECORDING_PATH =
  "*/api/v1/workspaces/:workspaceId/recordings/:recordingId";
const RESERVE_PATH = `${RECORDING_PATH}/audio-chunks`;
/** BE 문서 예시: 3,200바이트(1,600프레임) 무음 PCM의 SHA-256 */
const SHORT_SILENCE_FRAMES = 1_600;
const SHORT_SILENCE_CHECKSUM = "WjEigd9L2N+7TUqUrQv0TQG7jPztEga5DiG0ygVozbE=";

interface StartBody {
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
    http.post<PathParams, StartBody>(
      "*/api/v1/workspaces/:workspaceId/recordings",
      async ({ request }) => {
        bodies.push(await request.clone().json());
      },
    ),
  );

  return bodies;
};

const recordReserveBodies = () => {
  const bodies: ReserveBody[] = [];
  mockServer.use(
    http.post<PathParams, ReserveBody>(RESERVE_PATH, async ({ request }) => {
      bodies.push(await request.clone().json());
    }),
  );

  return bodies;
};

/** 응답을 붙잡아 뒀다가 `respond`를 부를 때 차례로 열어 줘요 */
const holdResponses = (action: "pause" | "resume") => {
  const waiting: (() => void)[] = [];
  const response =
    action === "pause" ? recordingPauseResponse : recordingResumeResponse;
  mockServer.use(
    http.post(`${RECORDING_PATH}/${action}`, async () => {
      await new Promise<void>((resolve) => waiting.push(resolve));

      return HttpResponse.json(response);
    }),
  );

  return { respond: () => waiting.shift()?.() };
};

const startRecording = async (
  result: ReturnType<typeof renderRecordingControl>,
) => {
  await act(async () => {
    await result.current.startRecording(WORKSPACE_ID);
  });

  return FakePcmCollector.instances[0];
};

const pauseRecording = async (
  result: ReturnType<typeof renderRecordingControl>,
) => {
  await act(async () => {
    await result.current.pauseRecording();
  });
};

const getStatus = () => useRecordingStore.getState().status;

describe("useRecordingControl의 PCM 조각 녹음", () => {
  afterEach(() => {
    useRecordingStore.getState().discardRecording();
    clearRecordingStartProof();
    mockServer.events.removeAllListeners();
    events.length = 0;
    FakePcmCollector.instances.length = 0;
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
});
