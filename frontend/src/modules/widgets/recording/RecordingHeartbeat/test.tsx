import { PostRecordingHeartbeatResponseDto } from "@api/dto/recording";
import { recordingHeartbeatResponse } from "@api/mock/responses/recording";
import { DialogProvider } from "@provider/context/dialogContext";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { useRecordingStore } from "@store/recordingStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import {
  clearRecordingStartProof,
  getRecordingStartProof,
} from "@utils/recordingControlProof";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RecordingHeartbeat from ".";

const HEARTBEAT_INTERVAL_MS = 30 * 1000;

const WORKSPACE_ID = "1";
const RECORDING_PATH = getRouterPath({
  routeKey: "RECORDING",
  params: { workspaceId: WORKSPACE_ID },
});

const expected = new PostRecordingHeartbeatResponseDto(
  recordingHeartbeatResponse,
);

/** 녹음은 레이아웃 안의 어느 화면에서나 이어지므로, 라우트에서처럼 화면들을 감싸 둬요. */
const renderRecordingHeartbeat = () => {
  const router = createMemoryRouter(
    [
      {
        element: (
          <RecordingHeartbeat>
            <Outlet />
          </RecordingHeartbeat>
        ),
        children: [
          { path: PATH_ROUTE.WORKSPACE_HOME, element: <p>홈 화면</p> },
          { path: PATH_ROUTE.RECORDING, element: <p>녹음 화면</p> },
        ],
      },
    ],
    { initialEntries: [RECORDING_PATH] },
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <DialogProvider>
        <RouterProvider router={router} />
      </DialogProvider>
    </QueryClientProvider>,
  );

  return { router };
};

/** 녹음은 독에서 증명을 만들어 시작하므로, 같은 순서로 미리 시작해 둬요. */
const startRecording = async () => {
  getRecordingStartProof();

  await act(async () => {
    await useRecordingStore.getState().connectMicrophone();
    useRecordingStore.getState().startRecording({
      workspaceId: Number(WORKSPACE_ID),
      recordingId: expected.recordingId,
    });
  });
};

describe("RecordingHeartbeat", () => {
  beforeEach(() => {
    // 요청은 실제 시간으로 흘러야 해서 신호 주기만 가짜로 돌려요
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    // 전역 저장소라 테스트끼리 녹음이 새지 않도록 처음 상태로 되돌려요
    useRecordingStore.getState().discardRecording();
    clearRecordingStartProof();
    vi.useRealTimers();
  });

  it("30초마다 생존 신호를 보내고, 녹음한 시간을 서버의 누적 시간으로 맞춘다", async () => {
    await startRecording();
    renderRecordingHeartbeat();

    expect(screen.getByText("녹음 화면")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS - 1);
    });
    expect(useRecordingStore.getState().accumulatedMs).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    // waitFor가 setInterval로 다시 확인하므로 응답을 기다리기 전에 실제 타이머로 돌려요
    vi.useRealTimers();

    await waitFor(() =>
      expect(useRecordingStore.getState().accumulatedMs).toBe(
        expected.elapsedMillis,
      ),
    );
    expect(useRecordingStore.getState().status).toBe("recording");
  });
});
