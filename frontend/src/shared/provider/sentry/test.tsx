import { ThemeProvider } from "@emotion/react";
import { AUTH_REFRESH_API_PATH } from "@api/fetch/api/v1/auth/refresh";
import { httpClient } from "@api/httpClient";
import { mockServer } from "@api/mock/server";
import AppErrorBoundary from "@provider/AppErrorBoundary";
import { queryClient } from "@provider/queryClient";
import { theme } from "@provider/themeProvider";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import * as Sentry from "@sentry/react";
import type { ErrorEvent } from "@sentry/react";
import {
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { getRootErrorHandlers, initSentry } from ".";

const TEST_PATH = "/__sentry-report";
const FALLBACK_TITLE = "잠시 문제가 생겼어요";

/** Sentry가 전송하려던 오류 이벤트. 실제 전송 대신 여기 모아요 */
const sentEvents: ErrorEvent[] = [];

const textOf = (body: string | Uint8Array) =>
  typeof body === "string" ? body : new TextDecoder().decode(body);

/** 봉투(envelope)의 줄 중 `event` 항목 바로 다음 줄이 이벤트 본문이에요 */
const toErrorEvents = (body: string | Uint8Array) => {
  const lines = textOf(body)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  return lines.flatMap((line, index) =>
    line.type === "event" ? [lines[index + 1] as unknown as ErrorEvent] : [],
  );
};

const sendEnvelope = vi.fn(async ({ body }: { body: string | Uint8Array }) => {
  sentEvents.push(...toErrorEvents(body));
  return {};
});

const flushEvents = async () => {
  await Sentry.flush();
  return sentEvents;
};

function QueryContent() {
  const { data } = useQuery({
    queryKey: ["sentry-report"],
    queryFn: async () =>
      (await httpClient.get<{ text: string }>(TEST_PATH)).data,
    retry: false,
    throwOnError: true,
  });

  return <p>{data?.text}</p>;
}

function MutationContent() {
  const { mutate } = useMutation({
    mutationFn: () => httpClient.post(TEST_PATH),
  });

  return (
    <button type="button" onClick={() => mutate()}>
      보내기
    </button>
  );
}

const renderApp = (content: ReactNode) => {
  const { onCaughtError, onRecoverableError } = getRootErrorHandlers();

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/target"]}>
          <AppErrorBoundary>
            <Routes>
              <Route path="/target" element={content} />
              <Route path={PATH_ROUTE.LOGIN} element={<p>로그인 화면</p>} />
            </Routes>
          </AppErrorBoundary>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
    { onCaughtError, onRecoverableError },
  );
};

describe("initSentry", () => {
  it("DSN이 없으면 Sentry를 켜지 않고, React 루트 오류 처리도 기본값으로 둔다", () => {
    expect(initSentry({ dsn: "" })).toBe(false);
    expect(Sentry.isInitialized()).toBe(false);
    expect(getRootErrorHandlers()).toEqual({});
  });
});

describe("Sentry 보고", () => {
  beforeAll(() => {
    initSentry({
      dsn: "https://public@o0.ingest.sentry.io/0",
      environment: "test",
      transport: (options) => Sentry.createTransport(options, sendEnvelope),
    });
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    sentEvents.length = 0;
    queryClient.clear();
  });

  afterAll(async () => {
    await Sentry.close();
  });

  it("Boundary가 잡은 렌더링 오류는 Boundary가 아니라 React 루트에서 한 번만 보고한다", async () => {
    function BrokenContent(): never {
      throw new Error("렌더링 실패");
    }

    renderApp(<BrokenContent />);

    expect(screen.getByText(FALLBACK_TITLE)).toBeInTheDocument();
    const events = await flushEvents();
    expect(events).toHaveLength(1);
    expect(events[0].exception?.values?.map(({ value }) => value)).toContain(
      "렌더링 실패",
    );
  });

  it("Boundary로 넘어간 Query 오류는 QueryCache와 Boundary를 거쳐도 한 번만 보고한다", async () => {
    mockServer.use(
      http.get(`*${TEST_PATH}`, () => new HttpResponse(null, { status: 500 })),
    );

    renderApp(<QueryContent />);

    expect(await screen.findByText(FALLBACK_TITLE)).toBeInTheDocument();
    const events = await flushEvents();
    expect(events).toHaveLength(1);
    expect(events[0].tags).toMatchObject({ source: "query" });
  });

  it("실패한 Mutation은 MutationCache에서 보고한다", async () => {
    mockServer.use(
      http.post(`*${TEST_PATH}`, () => new HttpResponse(null, { status: 503 })),
    );

    renderApp(<MutationContent />);
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));

    await vi.waitFor(() => expect(sentEvents).toHaveLength(1));
    expect(sentEvents[0].tags).toMatchObject({ source: "mutation" });
  });

  // 바로 앞 이벤트와만 비교하는 dedupeIntegration이 아니라, SDK가 오류 객체에 남기는 표시로 막는지 보려고 다른 오류를 끼워요
  it("같은 오류가 여러 경로로 들어오면 사이에 다른 오류가 끼어도 한 번만 보낸다", async () => {
    const error = new Error("한 번만");

    Sentry.captureException(error);
    Sentry.captureException(new Error("다른 오류"));
    Sentry.captureException(error);

    const events = await flushEvents();
    expect(
      events.map(({ exception }) => exception?.values?.[0]?.value),
    ).toEqual(["한 번만", "다른 오류"]);
  });

  it("401은 Boundary까지 와도 보고하지 않는다", async () => {
    mockServer.use(
      http.get(`*${TEST_PATH}`, () => new HttpResponse(null, { status: 401 })),
      http.post(
        `*${AUTH_REFRESH_API_PATH}`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    renderApp(<QueryContent />);

    expect(await screen.findByText("로그인 화면")).toBeInTheDocument();
    expect(await flushEvents()).toHaveLength(0);
  });

  it("보내는 이벤트에서 주소의 쿼리 파라미터를 지운다", async () => {
    window.history.pushState(null, "", "/workspace/1?keyword=회의록");

    Sentry.captureException(new Error("주소 확인"));

    const [event] = await flushEvents();
    expect(event.request?.url).toBe(`${window.location.origin}/workspace/1`);
  });

  // 쿼리는 SDK 설정(dataCollection)도 지우지만, 경로의 초대 토큰은 beforeSend만 가려요
  it("보내는 이벤트에서 주소의 초대 토큰을 가린다", async () => {
    window.history.pushState(null, "", "/invite/secret-token");

    Sentry.captureException(new Error("초대 주소 확인"));

    const [event] = await flushEvents();
    expect(event.request?.url).toBe(`${window.location.origin}/invite/[token]`);
  });
});
