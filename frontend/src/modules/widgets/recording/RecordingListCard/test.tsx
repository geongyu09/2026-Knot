import { GetMeResponseDto } from "@api/dto/auth";
import { GetCurrentRecordingResponseDto } from "@api/dto/recording";
import { AUTH_ME_API_PATH } from "@api/fetch/api/v1/auth/me";
import { CURRENT_RECORDING_API_PATH } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/current";
import { meResponse } from "@api/mock/responses/auth";
import { currentRecordingResponse } from "@api/mock/responses/recording";
import { mockServer } from "@api/mock/server";
import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { useRecordingStore } from "@store/recordingStore";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { formatRecordingTime } from "@utils/formatRecordingTime";
import { delay, http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import RecordingListCard from ".";

const WORKSPACE_ID = 1;
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: String(WORKSPACE_ID) },
});
const RECORDING_PATH = getRouterPath({
  routeKey: "RECORDING",
  params: { workspaceId: String(WORKSPACE_ID) },
});
const CURRENT_URL = `*${CURRENT_RECORDING_API_PATH(WORKSPACE_ID)}`;

const expectedRecording = new GetCurrentRecordingResponseDto(
  currentRecordingResponse,
);
const RECORDING_DOCUMENTS_PATH = getRouterPath({
  routeKey: "RECORDING_DOCUMENTS",
  params: {
    workspaceId: String(WORKSPACE_ID),
    recordingId: String(expectedRecording.recordingId),
  },
});
const RECORDING_TITLE = `${new GetMeResponseDto(meResponse).nickname} 님의 녹음`;
const EMPTY_TEXT = "진행 중인 녹음이 없어요";
const LOAD_FAILED_TEXT = "녹음 상태를 불러오지 못했어요. 다시 시도해 주세요.";
const OPEN_RECORDING = "녹음 화면으로";
const ORGANIZING_TEXT = "문서 정리 중";
const ORGANIZING_HINT = "끝나면 확인이 필요한 문서에 올라와요";
const OPEN_RECORDING_DOCUMENTS = "보기";
const MS_PER_SECOND = 1000;
// 문서 정리 중인 녹음을 다시 조회하는 간격
const ORGANIZING_POLL_INTERVAL_MS = 3000;

/** 응답의 누적 시간에 초를 더한 시간 표시예요 */
const elapsedTimeAfter = (seconds: number) =>
  formatRecordingTime(
    expectedRecording.elapsedMillis / MS_PER_SECOND + seconds,
  );

const renderCard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: PATH_ROUTE.WORKSPACE_HOME, element: <RecordingListCard /> },
      { path: PATH_ROUTE.RECORDING, element: null },
      { path: PATH_ROUTE.RECORDING_DOCUMENTS, element: null },
    ],
    { initialEntries: [HOME_PATH] },
  );

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );

  return { router };
};

/** 현재 녹음 조회가 이 응답으로 답하게 해요 */
const respondCurrentRecording = (
  response: () => Response | Promise<Response>,
) => {
  mockServer.use(http.get(CURRENT_URL, response));
};

const respondNoRecording = () =>
  respondCurrentRecording(() => new HttpResponse(null, { status: 204 }));

const respondStatus = (status: "RECORDING" | "PAUSED" | "PROCESSING") =>
  respondCurrentRecording(() =>
    HttpResponse.json({ ...currentRecordingResponse, status }),
  );

/** 가짜 타이머를 ms만큼 진행시키며 사이사이의 응답 마이크로태스크도 흘려보내요 */
const advanceTimers = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** 독에서 시작한 것처럼 이 탭에서 녹음을 시작해 둬요 */
const startRecordingInThisTab = async () => {
  await act(async () => {
    await useRecordingStore.getState().connectMicrophone();
    useRecordingStore.getState().startRecording({
      workspaceId: WORKSPACE_ID,
      recordingId: expectedRecording.recordingId,
    });
  });
};

describe("RecordingListCard", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // 전역 저장소라 테스트끼리 녹음이 새지 않도록 처음 상태로 되돌려요
    useRecordingStore.getState().discardRecording();
  });

  it("현재 녹음을 조회하는 동안에는 카드가 불러오는 중으로 표시된다", () => {
    respondCurrentRecording(async () => {
      await delay("infinite");
      return new HttpResponse(null, { status: 204 });
    });

    renderCard();

    expect(
      screen.getByRole("region", { name: "진행 중인 녹음" }),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("내 닉네임을 조회하는 동안에는 녹음이 있어도 녹음 칸 대신 불러오는 중으로 표시된다", async () => {
    mockServer.use(
      http.get(`*${AUTH_ME_API_PATH}`, async () => {
        await delay("infinite");
        return HttpResponse.json(meResponse);
      }),
    );
    vi.useFakeTimers();
    renderCard();
    await advanceTimers(0); // 현재 녹음 조회 응답을 흘려보내요

    expect(
      screen.getByRole("region", { name: "진행 중인 녹음" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByText(`녹음 중 · ${elapsedTimeAfter(0)}`),
    ).not.toBeInTheDocument();
  });

  it("진행 중인 녹음이 없으면(204) 빈 상태 문구를 보여 주고 버튼은 두지 않는다", async () => {
    respondNoRecording();

    renderCard();

    expect(await screen.findByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: OPEN_RECORDING }),
    ).not.toBeInTheDocument();
  });

  it("녹음 중이면 녹음 중 상태·경과 시간과 내 닉네임의 녹음 이름을 보여 준다", async () => {
    renderCard();

    expect(
      await screen.findByText(`녹음 중 · ${elapsedTimeAfter(0)}`),
    ).toBeInTheDocument();
    expect(await screen.findByText(RECORDING_TITLE)).toBeInTheDocument();
  });

  it("녹음 중이면 응답을 받은 뒤 흐른 시간만큼 경과 시간이 매초 늘어난다", async () => {
    vi.useFakeTimers();
    renderCard();
    await advanceTimers(0); // 조회 응답을 흘려보내요

    expect(
      screen.getByText(`녹음 중 · ${elapsedTimeAfter(0)}`),
    ).toBeInTheDocument();

    await advanceTimers(3 * MS_PER_SECOND);

    expect(
      screen.getByText(`녹음 중 · ${elapsedTimeAfter(3)}`),
    ).toBeInTheDocument();
  });

  it("일시정지면 일시정지 상태와 멈춘 경과 시간을 보여 준다", async () => {
    respondStatus("PAUSED");
    vi.useFakeTimers();
    renderCard();
    await advanceTimers(0); // 조회 응답을 흘려보내요

    await advanceTimers(3 * MS_PER_SECOND);

    expect(
      screen.getByText(`일시정지 · ${elapsedTimeAfter(0)}`),
    ).toBeInTheDocument();
  });

  it("문서를 정리하는 중이면 녹음 시간 없이 문서 정리 중과 녹음 이름, 안내, 「보기」를 보여 준다", async () => {
    respondStatus("PROCESSING");

    renderCard();

    // 문구가 정확히 같아야 해서 「문서 정리 중 · 12:00」처럼 시간이 붙으면 찾지 못해요
    expect(await screen.findByText(ORGANIZING_TEXT)).toBeInTheDocument();
    expect(screen.getByText(RECORDING_TITLE)).toBeInTheDocument();
    expect(screen.getByText(ORGANIZING_HINT)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: OPEN_RECORDING_DOCUMENTS }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: OPEN_RECORDING }),
    ).not.toBeInTheDocument();
  });

  it("문서 정리 중에 「보기」를 누르면 그 녹음의 문서 정리 화면으로 간다", async () => {
    respondStatus("PROCESSING");
    const { router } = renderCard();

    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: OPEN_RECORDING_DOCUMENTS }),
      );
    });

    expect(router.state.location.pathname).toBe(RECORDING_DOCUMENTS_PATH);
  });

  it("문서 정리 중이면 현재 녹음을 다시 조회하다가, 정리가 끝나 표시할 녹음이 없어지면(204) 빈 상태로 돌아가고 다시 조회를 멈춘다", async () => {
    let requestCount = 0;
    respondCurrentRecording(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return HttpResponse.json({
          ...currentRecordingResponse,
          status: "PROCESSING",
        });
      }
      return new HttpResponse(null, { status: 204 });
    });
    vi.useFakeTimers();
    renderCard();
    await advanceTimers(0); // 조회 응답을 흘려보내요

    expect(screen.getByText(ORGANIZING_TEXT)).toBeInTheDocument();

    // 다시 조회한 응답이 도착할 때까지 간격보다 조금 더 진행해요
    await advanceTimers(ORGANIZING_POLL_INTERVAL_MS + 100);

    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();

    await advanceTimers(ORGANIZING_POLL_INTERVAL_MS * 3);

    expect(requestCount).toBe(2);
  });

  it("문서 정리 중에 다시 조회가 다시 물어도 결과가 같은 오류(4xx)로 실패하면 다시 조회를 멈추고, 받은 정리 중 상태를 그대로 보여 준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let requestCount = 0;
    respondCurrentRecording(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return HttpResponse.json({
          ...currentRecordingResponse,
          status: "PROCESSING",
        });
      }
      return HttpResponse.json(null, { status: 403 });
    });
    vi.useFakeTimers();
    renderCard();
    await advanceTimers(0); // 조회 응답을 흘려보내요

    // 다시 조회한 응답이 도착할 때까지 간격보다 조금 더 진행해요
    await advanceTimers(ORGANIZING_POLL_INTERVAL_MS + 100);
    await advanceTimers(ORGANIZING_POLL_INTERVAL_MS * 3);

    expect(requestCount).toBe(2);
    expect(screen.getByText(ORGANIZING_TEXT)).toBeInTheDocument();
  });

  it("문서 정리 중에 다시 조회가 서버 오류(5xx)로 실패하면 잠깐의 문제일 수 있어 계속 다시 조회한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let requestCount = 0;
    respondCurrentRecording(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return HttpResponse.json({
          ...currentRecordingResponse,
          status: "PROCESSING",
        });
      }
      return HttpResponse.json(null, { status: 500 });
    });
    vi.useFakeTimers();
    renderCard();
    await advanceTimers(0); // 조회 응답을 흘려보내요

    await advanceTimers(ORGANIZING_POLL_INTERVAL_MS * 3 + 100);

    expect(requestCount).toBe(4);
  });

  it("녹음 중이면 현재 녹음을 주기적으로 다시 조회하지 않는다", async () => {
    let requestCount = 0;
    respondCurrentRecording(() => {
      requestCount += 1;
      return HttpResponse.json(currentRecordingResponse);
    });
    vi.useFakeTimers();
    renderCard();
    await advanceTimers(0); // 조회 응답을 흘려보내요

    await advanceTimers(ORGANIZING_POLL_INTERVAL_MS * 3);

    expect(requestCount).toBe(1);
  });

  it("이 탭에서 녹음 중이면 앞 녹음의 문서를 정리하는 중이어도 이 탭의 녹음을 보여 준다", async () => {
    respondStatus("PROCESSING");
    await startRecordingInThisTab();
    vi.useFakeTimers();

    renderCard();
    // 이 탭의 녹음 칸은 현재 녹음 조회를 기다리지 않고 보여요. 정리 중 응답까지 흘려보낸 뒤에 확인해요
    await advanceTimers(0);

    expect(
      screen.getByRole("button", { name: OPEN_RECORDING }),
    ).toBeInTheDocument();
    expect(screen.queryByText(ORGANIZING_TEXT)).not.toBeInTheDocument();
  });

  it("조회에 실패하면 빈 상태 대신 카드 안에 실패 안내와 다시 시도를 보여 주고, 오류는 콘솔에도 남긴다 (ERR-09)", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    respondCurrentRecording(() => HttpResponse.json(null, { status: 500 }));

    renderCard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      LOAD_FAILED_TEXT,
    );
    expect(
      screen.getByRole("heading", { name: "진행 중인 녹음" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "다시 시도" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it("다시 시도를 누르면 현재 녹음만 다시 조회해 보여 준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let attempts = 0;
    respondCurrentRecording(() => {
      attempts += 1;
      if (attempts === 1) return HttpResponse.json(null, { status: 500 });

      return HttpResponse.json(currentRecordingResponse);
    });

    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText(RECORDING_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(LOAD_FAILED_TEXT)).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("한 번 받은 뒤 다시 조회만 실패하면 실패 안내 대신 받은 녹음을 그대로 보여 준다", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    renderCard();
    expect(await screen.findByText(RECORDING_TITLE)).toBeInTheDocument();

    respondCurrentRecording(() => HttpResponse.json(null, { status: 500 }));
    try {
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      // 실패를 그린 뒤에 콘솔에 남기므로, 남겼으면 실패한 상태가 화면에 반영된 거예요
      await waitFor(() => expect(consoleError).toHaveBeenCalled());

      expect(screen.getByText(RECORDING_TITLE)).toBeInTheDocument();
      expect(screen.queryByText(LOAD_FAILED_TEXT)).not.toBeInTheDocument();
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it("이 탭에서 시작한 녹음이면 조회에 실패해도 실패 안내 대신 이 탭의 녹음을 보여 준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    respondCurrentRecording(() => HttpResponse.json(null, { status: 500 }));
    await startRecordingInThisTab();

    renderCard();

    expect(
      await screen.findByRole("button", { name: OPEN_RECORDING }),
    ).toBeInTheDocument();
    expect(screen.queryByText(LOAD_FAILED_TEXT)).not.toBeInTheDocument();
  });

  it("다른 탭에서 시작한 녹음이면 「녹음 화면으로」 버튼을 숨긴다", async () => {
    renderCard();

    expect(await screen.findByText(RECORDING_TITLE)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: OPEN_RECORDING }),
    ).not.toBeInTheDocument();
  });

  it("이 탭에서 시작한 녹음이면 「녹음 화면으로」를 눌러 녹음 화면으로 간다", async () => {
    await startRecordingInThisTab();
    const { router } = renderCard();

    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: OPEN_RECORDING }),
      );
    });

    expect(router.state.location.pathname).toBe(RECORDING_PATH);
  });

  it("이 탭에서 시작한 녹음이면 서버 응답이 아니라 이 탭의 상태와 시간을 보여 준다", async () => {
    // 서버가 아직 녹음을 모르는 것처럼 답해도 이 탭의 녹음을 보여 줘요
    respondNoRecording();
    await startRecordingInThisTab();
    renderCard();

    expect(
      await screen.findByText(`녹음 중 · ${formatRecordingTime(0)}`),
    ).toBeInTheDocument();

    await act(async () => {
      useRecordingStore.getState().pauseRecording();
    });

    expect(
      screen.getByText(`일시정지 · ${formatRecordingTime(0)}`),
    ).toBeInTheDocument();
  });

  it("창으로 돌아오면 현재 녹음을 다시 조회한다", async () => {
    renderCard();
    expect(await screen.findByText(RECORDING_TITLE)).toBeInTheDocument();

    respondNoRecording();
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() =>
      expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument(),
    );
    focusManager.setFocused(undefined);
  });
});
