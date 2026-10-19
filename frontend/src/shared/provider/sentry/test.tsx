import { ThemeProvider } from "@emotion/react";
import { AUTH_REFRESH_API_PATH } from "@api/fetch/api/v1/auth/refresh";
import { httpClient } from "@api/httpClient";
import { mockServer } from "@api/mock/server";
import AppErrorBoundary from "@provider/AppErrorBoundary";
import { queryClient } from "@provider/queryClient";
import { theme } from "@provider/themeProvider";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import * as Sentry from "@sentry/react";
import type { BrowserOptions, ErrorEvent } from "@sentry/react";
import {
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
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

import {
  captureCaughtError,
  captureRequestError,
  getRootErrorHandlers,
  initSentry,
  useSentryRoutes,
} from ".";

const TEST_PATH = "/__sentry-report";
const FALLBACK_TITLE = "잠시 문제가 생겼어요";

/** Sentry가 전송하려던 오류 이벤트. 실제 전송 대신 여기 모아요 */
const sentEvents: ErrorEvent[] = [];

const textOf = (body: string | Uint8Array) =>
  typeof body === "string" ? body : new TextDecoder().decode(body);

/** 보낸 span 하나. 속성은 `{ type, value }` 모양으로 바뀌어 나가요 */
interface SentSpan {
  name: string;
  attributes: Record<string, { value: unknown }>;
}

/** Sentry가 전송하려던 span. 실제 전송 대신 여기 모아요 */
const sentSpans: SentSpan[] = [];

/** 봉투(envelope)의 줄 중 `type` 항목 바로 다음 줄이 그 항목의 본문이에요 */
const toEnvelopeItems = (body: string | Uint8Array, type: string) => {
  const lines = textOf(body)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  return lines.flatMap((line, index) =>
    line.type === type ? [lines[index + 1]] : [],
  );
};

const sendEnvelope = vi.fn(async ({ body }: { body: string | Uint8Array }) => {
  sentEvents.push(
    ...(toEnvelopeItems(body, "event") as unknown as ErrorEvent[]),
  );
  // span은 여러 개가 한 항목의 `items`에 묶여 와요
  sentSpans.push(
    ...(
      toEnvelopeItems(body, "span") as unknown as { items: SentSpan[] }[]
    ).flatMap(({ items }) => items),
  );
  return {};
});

const flushEvents = async () => {
  await Sentry.flush();
  return sentEvents;
};

const SENTRY_DSN = "https://public@o0.ingest.sentry.io/0";

const testTransport: BrowserOptions["transport"] = (options) =>
  Sentry.createTransport(options, sendEnvelope);

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

  it("DSN이 없으면 잡고 넘어간 실패도 보내지 않는다", async () => {
    captureCaughtError({ error: new Error("꺼진 Sentry"), feature: "auth" });

    await Sentry.flush();
    expect(sendEnvelope).not.toHaveBeenCalled();
  });
});

describe("Sentry 보고", () => {
  beforeAll(() => {
    initSentry({
      dsn: SENTRY_DSN,
      environment: "test",
      transport: testTransport,
    });
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    sentEvents.length = 0;
    sentSpans.length = 0;
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

  // 백엔드 CORS가 두 헤더를 허용하지 않아, 붙으면 브라우저가 API 요청을 모두 막아요
  it("API 요청에 추적 헤더(sentry-trace, baggage)를 붙이지 않는다", async () => {
    mockServer.use(
      http.get(`*${TEST_PATH}`, ({ request }) =>
        HttpResponse.json({
          sentryTrace: request.headers.get("sentry-trace"),
          baggage: request.headers.get("baggage"),
        }),
      ),
    );
    const noTraceHeaders = { sentryTrace: null, baggage: null };

    const { data } = await httpClient.get(TEST_PATH);
    // SSE 요청은 httpClient 대신 fetch로 보내요
    const response = await fetch(`${window.location.origin}${TEST_PATH}`);

    expect(Sentry.getClient()?.getOptions().tracesSampleRate).toBe(1);
    expect(data).toEqual(noTraceHeaders);
    expect(await response.json()).toEqual(noTraceHeaders);
  });

  it("서로 다른 API의 오류는 묶음 기준(fingerprint)을 달리해 한 Issue로 합치지 않는다", async () => {
    mockServer.use(
      http.get("*/api/v1/workspaces/:workspaceId/documents", () =>
        HttpResponse.json({ code: "INTERNAL_SERVER_ERROR" }, { status: 500 }),
      ),
      http.get(
        "*/api/v1/workspaces/:workspaceId/recordings",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const requestError = (url: string) =>
      httpClient.get(url).catch((error: unknown) => error);

    captureRequestError({
      error: await requestError("/api/v1/workspaces/1/documents"),
      source: "query",
    });
    captureRequestError({
      error: await requestError("/api/v1/workspaces/2/recordings"),
      source: "query",
    });

    const events = await flushEvents();
    expect(events.map(({ fingerprint }) => fingerprint)).toEqual([
      [
        "GET",
        "/api/v1/workspaces/:id/documents",
        "500",
        "INTERNAL_SERVER_ERROR",
      ],
      ["GET", "/api/v1/workspaces/:id/recordings", "500"],
    ]);
  });

  describe("잡고 넘어간 실패", () => {
    it("기능 이름을 태그로 붙이고, 요청 실패는 API마다 묶음 기준을 달리해 보낸다", async () => {
      mockServer.use(
        http.post(
          `*${AUTH_REFRESH_API_PATH}`,
          () => new HttpResponse(null, { status: 500 }),
        ),
      );
      const error = await httpClient
        .post(AUTH_REFRESH_API_PATH)
        .catch((e: unknown) => e);

      captureCaughtError({ error, feature: "auth" });

      const [event] = await flushEvents();
      expect(event.tags).toMatchObject({ source: "caught", feature: "auth" });
      expect(event.fingerprint).toEqual(["POST", AUTH_REFRESH_API_PATH, "500"]);
      expect(event.exception?.values?.[0]?.mechanism).toMatchObject({
        handled: true,
      });
    });

    it("상황을 알리는 값을 함께 보낸다", async () => {
      captureCaughtError({
        error: new Error("조각 유실"),
        feature: "recording",
        extra: { lostChunkCount: 3 },
      });

      const [event] = await flushEvents();
      expect(event.extra).toEqual({ lostChunkCount: 3 });
    });

    it("보고 기준에서 빼는 실패(409)는 보내지 않는다", async () => {
      mockServer.use(
        http.post(
          `*${TEST_PATH}`,
          () => new HttpResponse(null, { status: 409 }),
        ),
      );
      const error = await httpClient.post(TEST_PATH).catch((e: unknown) => e);

      captureCaughtError({ error, feature: "document" });

      expect(await flushEvents()).toHaveLength(0);
    });

    it("react-query가 이미 보낸 같은 오류 객체는 다시 보내지 않는다", async () => {
      const error = new Error("한 번만 보낼 실패");

      captureRequestError({ error, source: "mutation" });
      captureCaughtError({ error, feature: "recording" });

      const events = await flushEvents();
      expect(events).toHaveLength(1);
      expect(events[0].tags).toMatchObject({ source: "mutation" });
    });

    // 녹음 화면은 권한 거절과 장치 없음을 마이크 안내 창으로 안내해요
    it.each(["NotAllowedError", "NotFoundError"])(
      "녹음에서 마이크를 받지 못한 %s는 보내지 않는다",
      async (name) => {
        captureCaughtError({
          error: new DOMException("마이크 없음", name),
          feature: "recording",
        });

        expect(await flushEvents()).toHaveLength(0);
      },
    );
  });

  it("보내는 span에서 주소의 쿼리 파라미터와 초대 토큰을 지운다", async () => {
    Sentry.startSpan(
      {
        name: "GET /api/v1/invitations/secret-token?code=1",
        attributes: {
          "url.full": `${window.location.origin}/invite/secret-token?from=mail#top`,
          "url.query": "?from=mail",
        },
      },
      () => {},
    );

    await flushEvents();
    const span = sentSpans.find(({ name }) =>
      name.startsWith("GET /api/v1/invitations"),
    );
    expect(span?.name).toBe("GET /api/v1/invitations/[token]");
    expect(span?.attributes["url.full"].value).toBe(
      `${window.location.origin}/invite/[token]`,
    );
    expect(span?.attributes).not.toHaveProperty("url.query");
    expect(JSON.stringify(sentSpans)).not.toContain("secret-token");
  });

  it("화면 이름을 주소 대신 라우트 경로 패턴으로 남긴다", async () => {
    function SentryRoutes() {
      return useSentryRoutes([
        { path: PATH_ROUTE.WORKSPACE_HOME, element: <p>워크스페이스 홈</p> },
      ]);
    }

    render(
      <MemoryRouter initialEntries={["/workspace/12"]}>
        <SentryRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText("워크스페이스 홈")).toBeInTheDocument();

    Sentry.captureException(new Error("화면 이름 확인"));

    const [event] = await flushEvents();
    expect(event.transaction).toBe(PATH_ROUTE.WORKSPACE_HOME);
  });

  // 리플레이는 첫 화면 번들에서 빼고 init 뒤에 받아 붙여요. SDK가 실제로 쓰는 설정을 봐요
  it("리플레이는 오류가 난 세션만 남기고 화면의 글자, 입력, 이미지와 네트워크 내용을 가린다", async () => {
    const client = Sentry.getClient();

    expect(client?.getOptions()).toMatchObject({
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1,
    });
    await vi.waitFor(() =>
      expect(client?.getIntegrationByName("Replay")).toMatchObject({
        _recordingOptions: { maskAllText: true, maskAllInputs: true },
        _initialOptions: {
          blockAllMedia: true,
          networkDetailAllowUrls: [],
          networkCaptureBodies: false,
        },
      }),
    );
  });
});

describe("성능 측정 비율", () => {
  afterEach(async () => {
    await Sentry.close();
  });

  // environment를 비우면 SDK가 production으로 보내므로 production과 같은 비율을 써요
  it.each([
    ["production", 0.2],
    [undefined, 0.2],
    ["development", 1],
  ])("environment가 %s면 %s만큼 측정한다", (environment, sampleRate) => {
    initSentry({ dsn: SENTRY_DSN, environment, transport: testTransport });

    expect(Sentry.getClient()?.getOptions().tracesSampleRate).toBe(sampleRate);
  });
});

describe("중계 경로로 보내기", () => {
  afterEach(async () => {
    sentEvents.length = 0;
    await Sentry.close();
  });

  it("광고 차단에 막히지 않게 Sentry 주소가 아니라 우리 주소의 중계 경로(/relay/s)로 보낸다", () => {
    const transport = vi.fn(testTransport);

    initSentry({ dsn: SENTRY_DSN, environment: "test", transport });

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/relay/s" }),
    );
  });

  // 중계 Worker는 봉투 머리의 DSN을 보고 우리 프로젝트일 때만 넘겨요
  it("보내는 봉투의 머리(첫 줄)에 DSN을 넣는다", async () => {
    initSentry({
      dsn: SENTRY_DSN,
      environment: "test",
      transport: testTransport,
    });

    sendEnvelope.mockClear();
    Sentry.captureException(new Error("중계로 보낼 오류"));
    await Sentry.flush();

    const [[{ body }]] = sendEnvelope.mock.calls;
    const [header] = textOf(body).split("\n");
    expect(JSON.parse(header)).toMatchObject({ dsn: SENTRY_DSN });
  });
});

// 초대 화면 주소(`/invite/:token`)에는 워크스페이스에 들어올 수 있는 토큰이 있어요. 리플레이는 주소를 그대로 기록해요
describe("초대 화면 리플레이", () => {
  const INVITE_URL = "/invite/secret-token";

  const initTestSentry = () =>
    initSentry({
      dsn: SENTRY_DSN,
      environment: "test",
      transport: testTransport,
    });

  const waitForReplay = () =>
    vi.waitFor(() => {
      const replay = Sentry.getReplay();
      expect(replay).toBeDefined();
      return replay!;
    });

  /** 앱처럼 `useSentryRoutes`로 그린 화면에서 다른 주소로 이동해요 */
  const renderSentryRoutes = (initialPath: string, to: string) => {
    function SentryRoutes() {
      return useSentryRoutes([
        {
          path: PATH_ROUTE.WORKSPACE_HOME,
          element: <Link to={to}>이동</Link>,
        },
        { path: PATH_ROUTE.DOCUMENTS, element: <p>문서 목록</p> },
        { path: PATH_ROUTE.INVITE, element: <p>초대 화면</p> },
      ]);
    }

    render(
      <MemoryRouter initialEntries={[initialPath]}>
        <SentryRoutes />
      </MemoryRouter>,
    );
  };

  afterEach(async () => {
    await Sentry.close();
    window.history.pushState(null, "", "/");
  });

  // 초대 경로 아래라면 토큰 뒤에 경로가 더 붙어도 초대 화면으로 봐요
  it.each([INVITE_URL, `${INVITE_URL}/next`])(
    "처음 들어온 주소가 초대 화면(%s)이면 리플레이를 붙이지 않는다",
    async (url) => {
      window.history.pushState(null, "", url);

      initTestSentry();
      await vi.dynamicImportSettled();

      expect(Sentry.getReplay()).toBeUndefined();
    },
  );

  it("리플레이를 받는 동안 초대 화면으로 이동하면 받은 뒤에도 붙이지 않는다", async () => {
    window.history.pushState(null, "", "/workspace/1");

    initTestSentry();
    window.history.pushState(null, "", INVITE_URL);
    await vi.dynamicImportSettled();

    expect(Sentry.getReplay()).toBeUndefined();
  });

  it("초대 화면 밖에서는 리플레이를 붙이고, 초대 화면이 아닌 곳으로 옮겨도 멈추지 않는다", async () => {
    window.history.pushState(null, "", "/workspace/1");

    initTestSentry();
    const stop = vi.spyOn(await waitForReplay(), "stop");
    renderSentryRoutes("/workspace/1", "/workspace/1/documents");
    fireEvent.click(screen.getByRole("link", { name: "이동" }));

    expect(screen.getByText("문서 목록")).toBeInTheDocument();
    expect(stop).not.toHaveBeenCalled();
  });

  it("다른 화면에서 초대 화면으로 이동하면 쌓인 기록을 보내지 않고 리플레이를 멈춘다", async () => {
    window.history.pushState(null, "", "/workspace/1");

    initTestSentry();
    const stop = vi.spyOn(await waitForReplay(), "stop");
    renderSentryRoutes("/workspace/1", INVITE_URL);
    expect(stop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "이동" }));

    expect(screen.getByText("초대 화면")).toBeInTheDocument();
    expect(stop).toHaveBeenCalledWith({ flush: false });
  });
});
