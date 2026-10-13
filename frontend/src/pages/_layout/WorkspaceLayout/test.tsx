import { GetDocumentResponseDto } from "@api/dto/document";
import { GetSearchMessagesResponseDto } from "@api/dto/search";
import { LAST_VIEWED_WORKSPACE_API_PATH } from "@api/fetch/api/v1/members/me/lastViewedWorkspace";
import { documentDetailsResponse } from "@api/mock/responses/document";
import { workspaceDetailResponse } from "@api/mock/responses/workspace";
import {
  searchAnswerStreamResponse,
  searchMessagesResponse,
  searchQuestionAnswerStreamResponse,
} from "@api/mock/responses/search";
import { mockServer } from "@api/mock/server";
import { ThemeProvider } from "@emotion/react";
import { DialogProvider } from "@provider/context/dialogContext";
import { theme } from "@provider/themeProvider";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { useSearchAnswerStore } from "@store/searchAnswerStore";
import { useTranscriptPanelStore } from "@store/transcriptPanelStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import SearchConversation from "@widgets/search/SearchConversation";
import type { ReactNode } from "react";

import WorkspaceLayout from ".";
import { WORKSPACE_DOCK_RAIL_ID } from "./constants/dockRail";

const WORKSPACE_ID = 1;
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: String(WORKSPACE_ID) },
});
const [firstDocument, secondDocument] = documentDetailsResponse.map(
  (response) => new GetDocumentResponseDto(response),
);
const DOCUMENT_PATH = getRouterPath({
  routeKey: "DOCUMENT",
  params: {
    workspaceId: String(WORKSPACE_ID),
    documentId: String(firstDocument.id),
  },
});
const OTHER_DOCUMENT_PATH = getRouterPath({
  routeKey: "DOCUMENT",
  params: {
    workspaceId: String(WORKSPACE_ID),
    documentId: String(secondDocument.id),
  },
});
const DOCUMENT_TEXT = "문서 본문";
const TRANSCRIPT_PANEL_TITLE = "원문";
/** 원문이 닫혀 있을 때의 버튼 이름 */
const OPEN_LABEL = "원문 보기";
/** 원문이 열려 있을 때의 버튼 이름 */
const CLOSE_LABEL = "원문 닫기";
const CHAT_PATH = getRouterPath({
  routeKey: "CHAT",
  params: { workspaceId: String(WORKSPACE_ID) },
});
const CONVERSATION_ID = "10";
const CONVERSATION_PATH = getRouterPath({
  routeKey: "CHAT_SESSION",
  params: { workspaceId: String(WORKSPACE_ID), sessionId: CONVERSATION_ID },
});
const ELSEWHERE_PATH = "/elsewhere";
const HOME_TEXT = "홈 본문";
const CHAT_TEXT = "탐색 본문";
// 경로 파라미터가 있어 fetch 상수 대신 mock 핸들러와 같은 패턴을 적어요
const WORKSPACE_PATH_PATTERN = "*/api/v1/workspaces/:workspaceId";

/**
 * @param chatElement - 탐색 화면 자리에 그릴 것. 탐색 흐름을 확인할 때만 실제 대화 칸을 넘겨요
 */
const renderLayout = (
  initialPath = HOME_PATH,
  chatElement: ReactNode = <p>{CHAT_TEXT}</p>,
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [
      { path: ELSEWHERE_PATH, element: <p>다른 화면</p> },
      {
        element: <WorkspaceLayout />,
        children: [
          { path: PATH_ROUTE.WORKSPACE_HOME, element: <p>{HOME_TEXT}</p> },
          { path: PATH_ROUTE.CHAT, element: chatElement },
          { path: PATH_ROUTE.CHAT_SESSION, element: chatElement },
          { path: PATH_ROUTE.DOCUMENT, element: <p>{DOCUMENT_TEXT}</p> },
        ],
      },
      { path: PATH_ROUTE.WORKSPACE, element: <p>워크스페이스 선택</p> },
      { path: PATH_ROUTE.LOGIN, element: <p>로그인</p> },
    ],
    { initialEntries: [ELSEWHERE_PATH, initialPath] },
  );

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <DialogProvider>
          <RouterProvider router={router} />
        </DialogProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );

  return { router, queryClient };
};

const answers = new GetSearchMessagesResponseDto(
  searchMessagesResponse,
).items.filter(({ role }) => role === "ASSISTANT");
const [answerWithEvidence] = answers.filter(
  ({ evidences }) => evidences.length > 0,
);
const [answerWithoutEvidence] = answers.filter(
  ({ evidences }) => evidences.length === 0,
);

/** 레이아웃 본문(Body) 칸. 왼쪽 레일·본문·오른쪽 레일이 이 칸의 자식으로 놓여요 */
const getBody = () =>
  document.getElementById(WORKSPACE_DOCK_RAIL_ID)?.parentElement;

const overrideWorkspaceStatus = (status: number) => {
  mockServer.use(
    http.get(WORKSPACE_PATH_PATTERN, () => new HttpResponse(null, { status })),
  );
};

const holdWorkspaceResponse = () => {
  mockServer.use(
    http.get(WORKSPACE_PATH_PATTERN, async () => {
      await delay("infinite");
      return HttpResponse.json(workspaceDetailResponse);
    }),
  );
};

/** 마지막으로 본 워크스페이스 갱신 요청의 본문을 모아 호출 횟수와 값을 확인해요 */
const captureLastViewedRequests = () => {
  const bodies: unknown[] = [];

  mockServer.use(
    http.put(`*${LAST_VIEWED_WORKSPACE_API_PATH}`, async ({ request }) => {
      bodies.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return bodies;
};

const waitForPath = (
  router: ReturnType<typeof createMemoryRouter>,
  pathname: string,
) =>
  waitFor(() => {
    expect(router.state.location.pathname).toBe(pathname);
  });

const waitRealTime = async (ms: number) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const goBack = async (router: ReturnType<typeof createMemoryRouter>) => {
  await act(async () => {
    await router.navigate(-1);
  });
};

describe("WorkspaceLayout", () => {
  it("워크스페이스를 조회하는 동안에는 본문 대신 스피너를 보여준다", () => {
    holdWorkspaceResponse();
    renderLayout();

    expect(
      screen.getByRole("status", { name: "워크스페이스를 불러오고 있어요" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(HOME_TEXT)).not.toBeInTheDocument();
  });

  it("조회에 성공하면 본문을 보여주고 마지막으로 본 워크스페이스를 한 번 갱신한다", async () => {
    const bodies = captureLastViewedRequests();
    renderLayout();

    expect(await screen.findByText(HOME_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(bodies).toEqual([{ workspaceId: WORKSPACE_ID }]);
    });
    await waitRealTime(100);
    expect(bodies).toHaveLength(1);
  });

  it("하위 라우트(탐색)로 들어와도 같은 판정을 거쳐 갱신한다", async () => {
    const bodies = captureLastViewedRequests();
    renderLayout(CHAT_PATH);

    expect(await screen.findByText(CHAT_TEXT)).toBeInTheDocument();
    await waitFor(() => {
      expect(bodies).toEqual([{ workspaceId: WORKSPACE_ID }]);
    });
  });

  it("갱신에 실패해도 본문은 그대로 보여준다", async () => {
    mockServer.use(
      http.put(
        `*${LAST_VIEWED_WORKSPACE_API_PATH}`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const { router } = renderLayout();

    expect(await screen.findByText(HOME_TEXT)).toBeInTheDocument();
    await waitRealTime(100);

    expect(screen.getByText(HOME_TEXT)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(HOME_PATH);
  });

  it("401이면 로그인 화면으로 replace 이동한다", async () => {
    overrideWorkspaceStatus(401);
    const { router } = renderLayout();

    await waitForPath(router, PATH_ROUTE.LOGIN);
    await goBack(router);

    expect(router.state.location.pathname).toBe(ELSEWHERE_PATH);
  });

  it.each([403, 404])(
    "%i면 워크스페이스 선택 화면으로 replace 이동한다",
    async (status) => {
      overrideWorkspaceStatus(status);
      const { router } = renderLayout();

      await waitForPath(router, PATH_ROUTE.WORKSPACE);
      await goBack(router);

      expect(router.state.location.pathname).toBe(ELSEWHERE_PATH);
    },
  );

  it("workspaceId가 정수가 아니면 조회하지 않고 워크스페이스 선택 화면으로 replace 이동한다", async () => {
    const { router } = renderLayout(
      getRouterPath({
        routeKey: "WORKSPACE_HOME",
        params: { workspaceId: "abc" },
      }),
    );

    await waitForPath(router, PATH_ROUTE.WORKSPACE);
    await goBack(router);

    expect(router.state.location.pathname).toBe(ELSEWHERE_PATH);
  });

  it("대화 목록 버튼은 탐색 화면에서만 둔다", async () => {
    renderLayout();

    expect(await screen.findByText(HOME_TEXT)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "대화 목록" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "사이드바" }),
    ).toBeInTheDocument();
  });

  it("탐색 화면에서는 사이드바와 대화 목록을 둘 다 열 수 있다", async () => {
    renderLayout(CHAT_PATH);

    expect(await screen.findByText(CHAT_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "사이드바" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "대화 목록" }),
    ).toBeInTheDocument();
  });

  it("사이드바 버튼을 누르면 사이드바가 왼쪽 레일로 옮겨 가 자리를 차지한다", async () => {
    renderLayout();

    expect(await screen.findByText(HOME_TEXT)).toBeInTheDocument();
    const rail = document.getElementById(WORKSPACE_DOCK_RAIL_ID);

    expect(rail).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "사이드바" }));

    expect(rail).toContainElement(
      screen.getByRole("complementary", { name: "워크스페이스 사이드바" }),
    );
  });

  it("레일은 하나만 담으므로 대화 목록을 고정하면 사이드바는 저절로 접힌다", async () => {
    renderLayout(CHAT_PATH);

    expect(await screen.findByText(CHAT_TEXT)).toBeInTheDocument();
    const sidebarTrigger = screen.getByRole("button", { name: "사이드바" });
    const chatListTrigger = screen.getByRole("button", { name: "대화 목록" });

    fireEvent.click(sidebarTrigger);

    expect(sidebarTrigger).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(chatListTrigger);

    expect(chatListTrigger).toHaveAttribute("aria-pressed", "true");
    expect(sidebarTrigger).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByRole("complementary", { name: "워크스페이스 사이드바" }),
    ).not.toBeInTheDocument();
  });

  it("고정한 패널을 다시 누르면 레일이 비어 아무것도 고정돼 있지 않다", async () => {
    renderLayout(CHAT_PATH);

    expect(await screen.findByText(CHAT_TEXT)).toBeInTheDocument();
    const chatListTrigger = screen.getByRole("button", { name: "대화 목록" });

    fireEvent.click(chatListTrigger);
    fireEvent.click(chatListTrigger);

    expect(chatListTrigger).toHaveAttribute("aria-pressed", "false");
    expect(
      document.getElementById(WORKSPACE_DOCK_RAIL_ID),
    ).toBeEmptyDOMElement();
  });

  it("사이드바를 고정해도 GNB는 레일 바깥에 남아 화면 전체 폭을 쓴다", async () => {
    renderLayout();

    expect(await screen.findByText(HOME_TEXT)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "사이드바" }));

    const rail = document.getElementById(WORKSPACE_DOCK_RAIL_ID);

    expect(rail?.parentElement).not.toContainElement(
      screen.getByRole("banner"),
    );
  });

  it("그 외 실패면 이동하지 않고 스피너를 유지한다", async () => {
    overrideWorkspaceStatus(500);
    const { router } = renderLayout();

    await waitRealTime(200);

    expect(router.state.location.pathname).toBe(HOME_PATH);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(HOME_TEXT)).not.toBeInTheDocument();
  });

  it("탐색 대화에서 답변의 찾은 기록을 펼치면 본문 오른쪽 레일에 찾은 기록 패널을 둔다 (SEARCH-R11)", async () => {
    renderLayout(`${CONVERSATION_PATH}?messageId=${answerWithEvidence.id}`);

    expect(await screen.findByText(CHAT_TEXT)).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "찾은 기록" });
    const main = screen.getByRole("main");
    const body = getBody();

    // 본문 바깥의 형제 칸에 놓여야 본문 폭이 줄어 대화 열·독이 함께 옮겨 가요
    expect(main).not.toContainElement(panel);
    expect(body?.children).toHaveLength(3);
    expect(body?.lastElementChild).toContainElement(panel);
    expect(body?.lastElementChild).not.toContainElement(main);
  });

  // 레일은 여닫힘을 폭으로 옮겨 가도록 탐색 화면에서 늘 두므로, 닫힘은 레일이 비었는지로 봐요(폭은 jsdom이 계산하지 못해요)
  it("찾은 기록을 펼치지 않으면 오른쪽 레일을 비워 본문이 폭을 다 쓴다 (SEARCH-R11)", async () => {
    renderLayout(CONVERSATION_PATH);

    expect(await screen.findByText(CHAT_TEXT)).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "찾은 기록" }),
    ).not.toBeInTheDocument();
    expect(getBody()?.lastElementChild).toBeEmptyDOMElement();
  });

  it("근거가 없는 답변을 펼치면 오른쪽 레일을 비운다 (SEARCH-R11)", async () => {
    renderLayout(`${CONVERSATION_PATH}?messageId=${answerWithoutEvidence.id}`);

    expect(await screen.findByText(CHAT_TEXT)).toBeInTheDocument();
    expect(getBody()?.lastElementChild).toBeEmptyDOMElement();
  });

  it("홈 화면에서는 오른쪽 레일과 찾은 기록 버튼을 두지 않는다 (Figma GNB/Floating)", async () => {
    renderLayout(`${HOME_PATH}?messageId=${answerWithEvidence.id}`);

    expect(await screen.findByText(HOME_TEXT)).toBeInTheDocument();
    expect(getBody()?.children).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /^찾은 기록/ }),
    ).not.toBeInTheDocument();
  });

  it("탐색 대화에서는 GNB 오른쪽에 찾은 기록 버튼을 두고, 누르면 오른쪽 레일이 열린다 (Figma GNB/Floating)", async () => {
    renderLayout(CONVERSATION_PATH);

    expect(await screen.findByText(CHAT_TEXT)).toBeInTheDocument();
    const toggle = within(screen.getByRole("banner")).getByRole("button", {
      name: "찾은 기록 보기",
    });

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(getBody()?.lastElementChild).toContainElement(
      screen.getByRole("region", { name: "찾은 기록" }),
    );
  });
});

describe("WorkspaceLayout의 원문 패널", () => {
  /**
   * 원문을 여닫은 적이 없는 처음 상태에서 레이아웃을 그려요.
   * 열림 여부는 전역 저장소와 브라우저에 남아 테스트끼리 이어지므로, 그리기 전에 둘 다 되돌려요
   */
  const renderLayoutAsFirstVisit = (initialPath = DOCUMENT_PATH) => {
    localStorage.clear();
    useTranscriptPanelStore.setState({ isOpenThisVisit: null });

    return renderLayout(initialPath);
  };

  /** 새로고침하고 다시 들어온 것처럼 화면과 이번 방문에서 정한 값을 지워요. 브라우저에 남긴 값은 그대로 둬요 */
  const startNewVisit = () => {
    cleanup();
    useTranscriptPanelStore.setState({ isOpenThisVisit: null });
  };

  const getTranscriptPanel = () =>
    screen.getByRole("region", { name: TRANSCRIPT_PANEL_TITLE });

  const queryTranscriptPanel = () =>
    screen.queryByRole("region", { name: TRANSCRIPT_PANEL_TITLE });

  const findToggle = (name: string) =>
    within(screen.getByRole("banner")).findByRole("button", { name });

  /**
   * 회원 정보를 받을 때까지 기다려요. GNB의 프로필에 회원의 이미지가 뜨면 받은 거예요.
   * 회원 정보를 받기 전과 닫아 둔 회원은 화면이 같아, 원문 버튼만 봐서는 받았는지 알 수 없어요
   */
  const waitForMember = () =>
    waitFor(() => {
      expect(
        screen.getByRole("img", { name: "내 프로필" }).querySelector("img"),
      ).toBeInTheDocument();
    });

  it("문서를 보는 화면에서는 GNB 오른쪽에 원문 버튼을 두고, 원문을 여닫은 적이 없는 회원에게는 오른쪽 레일에 원문 패널을 열어 둔다 (DOC-R3)", async () => {
    renderLayoutAsFirstVisit();

    expect(await screen.findByText(DOCUMENT_TEXT)).toBeInTheDocument();
    expect(await findToggle(CLOSE_LABEL)).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const panel = getTranscriptPanel();
    const main = screen.getByRole("main");
    const body = getBody();

    // 본문 바깥의 형제 칸에 놓여야 원문을 열었을 때 문서 폭이 줄어요
    expect(main).not.toContainElement(panel);
    expect(body?.children).toHaveLength(3);
    expect(body?.lastElementChild).toContainElement(panel);
  });

  // 레일은 여닫힘을 폭으로 옮겨 가도록 문서 화면에서 늘 두므로, 닫힘은 레일이 비었는지로 봐요(폭은 jsdom이 계산하지 못해요)
  it("원문 버튼을 누르면 원문 패널을 닫아 오른쪽 레일을 비우고, 다시 누르면 연다", async () => {
    renderLayoutAsFirstVisit();
    expect(await screen.findByText(DOCUMENT_TEXT)).toBeInTheDocument();

    fireEvent.click(await findToggle(CLOSE_LABEL));

    expect(queryTranscriptPanel()).not.toBeInTheDocument();
    expect(getBody()?.lastElementChild).toBeEmptyDOMElement();

    fireEvent.click(await findToggle(OPEN_LABEL));

    expect(getBody()?.lastElementChild).toContainElement(getTranscriptPanel());
  });

  it("원문을 닫아 둔 회원이 다른 문서로 다시 들어오면 원문 패널을 닫아 둔다 (DOC-R3)", async () => {
    renderLayoutAsFirstVisit();
    expect(await screen.findByText(DOCUMENT_TEXT)).toBeInTheDocument();
    fireEvent.click(await findToggle(CLOSE_LABEL));

    startNewVisit();
    renderLayout(OTHER_DOCUMENT_PATH);
    expect(await screen.findByText(DOCUMENT_TEXT)).toBeInTheDocument();
    await waitForMember();

    expect(await findToggle(OPEN_LABEL)).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(queryTranscriptPanel()).not.toBeInTheDocument();
  });

  it("워크스페이스를 조회하는 동안에는 원문 패널을 두지 않는다", async () => {
    holdWorkspaceResponse();
    renderLayoutAsFirstVisit();

    // 회원 정보를 받아 열림으로 정해진 뒤에도, 들어갈 수 있는 워크스페이스인지 알기 전에는 원문을 불러오지 않아요
    expect(await findToggle(CLOSE_LABEL)).toBeInTheDocument();
    expect(queryTranscriptPanel()).not.toBeInTheDocument();
  });

  it("홈 화면에서는 원문 버튼과 원문 패널 자리를 두지 않는다", async () => {
    renderLayoutAsFirstVisit(HOME_PATH);

    expect(await screen.findByText(HOME_TEXT)).toBeInTheDocument();
    await waitForMember();

    expect(
      screen.queryByRole("button", { name: /^원문/ }),
    ).not.toBeInTheDocument();
    expect(queryTranscriptPanel()).not.toBeInTheDocument();
    expect(getBody()?.children).toHaveLength(2);
  });

  it("탐색 화면에서는 원문 버튼을 두지 않는다", async () => {
    renderLayoutAsFirstVisit(CONVERSATION_PATH);

    expect(await screen.findByText(CHAT_TEXT)).toBeInTheDocument();
    await waitForMember();

    expect(
      screen.queryByRole("button", { name: /^원문/ }),
    ).not.toBeInTheDocument();
    expect(queryTranscriptPanel()).not.toBeInTheDocument();
  });
});

describe("WorkspaceLayout의 탐색 질문 흐름", () => {
  const MESSAGES_PATH =
    "*/api/v1/workspaces/:workspaceId/search/conversations/:conversationId/messages";
  const SEARCH_CONVERSATIONS_PATH =
    "*/api/v1/workspaces/:workspaceId/search/conversations";
  const SEARCH_QUESTIONS_PATH =
    "*/api/v1/workspaces/:workspaceId/search/conversations/:conversationId/questions";
  const QUESTION = "DB는 뭘로 정했어?";
  const FOLLOW_UP_QUESTION = "초기 스키마는 누가 정리했어?";

  const encoder = new TextEncoder();

  /** 서버가 보내는 SSE 프레임 한 개예요 */
  const toFrame = (event: string, data: object) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  /** 이번 테스트에서만 그 경로의 SSE 응답을 열어 두고, 테스트가 프레임을 하나씩 흘려보내게 해요 */
  const respondWithControlledSse = (path: string) => {
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    mockServer.use(
      http.post(
        path,
        () =>
          new HttpResponse(
            new ReadableStream<Uint8Array>({
              start(controller) {
                stream = controller;
              },
            }),
            { headers: { "Content-Type": "text/event-stream" } },
          ),
      ),
    );

    return {
      waitForOpen: () => waitFor(() => expect(stream).toBeDefined()),
      send: (event: string, data: object) =>
        stream?.enqueue(encoder.encode(toFrame(event, data))),
    };
  };

  /** 이번 테스트에서만 메시지 조회를 넘긴 메시지로 답하고, 조회 횟수를 세요 */
  const respondMessages = (items: object[]) => {
    const requests = { count: 0 };
    mockServer.use(
      http.get(MESSAGES_PATH, ({ params }) => {
        requests.count += 1;

        return HttpResponse.json({
          ...searchMessagesResponse,
          conversationId: Number(params.conversationId),
          items,
        });
      }),
    );

    return requests;
  };

  /** 독에 질문을 적어 보내기를 눌러요 */
  const sendFromDock = async (question: string) => {
    fireEvent.change(
      await screen.findByRole("textbox", { name: "무엇이든 요청하세요" }),
      { target: { value: question } },
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    });
  };

  const getConversation = () => screen.getByRole("region", { name: "대화" });

  afterEach(() => {
    // 전역 저장소라 테스트끼리 답변이 새지 않게 비워요
    useSearchAnswerStore.getState().abort();
  });

  it("새 대화 화면에서 독으로 보낸 질문과 흘러드는 답변을 보여주고, 접수된 대화 주소로 옮겨 간다 (SEARCH-R1)", async () => {
    const { conversationId, questionMessageId, answerMessageId, deltas, evidences } =
      searchAnswerStreamResponse;
    const answerText = deltas.join("");
    const messagesRequests = respondMessages([
      {
        ...searchMessagesResponse.items[0],
        id: questionMessageId,
        content: QUESTION,
      },
      {
        ...searchMessagesResponse.items[1],
        id: answerMessageId,
        content: answerText,
        evidences,
      },
    ]);
    const stream = respondWithControlledSse(SEARCH_CONVERSATIONS_PATH);
    const { router, queryClient } = renderLayout(
      CHAT_PATH,
      <SearchConversation />,
    );

    await sendFromDock(QUESTION);
    await stream.waitForOpen();

    expect(within(getConversation()).getByText(QUESTION)).toBeInTheDocument();

    stream.send("accepted", { conversationId, questionMessageId, answerMessageId });
    await waitForPath(
      router,
      getRouterPath({
        routeKey: "CHAT_SESSION",
        params: {
          workspaceId: String(WORKSPACE_ID),
          sessionId: String(conversationId),
        },
      }),
    );

    stream.send("delta", { answerMessageId, text: deltas[0] });
    expect(
      await within(getConversation()).findByText(deltas[0].trim()),
    ).toBeInTheDocument();

    stream.send("delta", { answerMessageId, text: deltas[1] });
    expect(
      await within(getConversation()).findByText(
        `${deltas[0]}${deltas[1]}`.trim(),
      ),
    ).toBeInTheDocument();

    deltas
      .slice(2)
      .forEach((text) => stream.send("delta", { answerMessageId, text }));
    stream.send("evidence", { answerMessageId, items: evidences });
    stream.send("completed", { answerMessageId, status: "COMPLETED" });

    expect(
      await screen.findByRole("button", {
        name: `기록 ${evidences.length}개에서 찾았어요`,
      }),
    ).toBeInTheDocument();
    // 조회는 대화 주소로 옮겨 갈 때 한 번, 답변이 끝나 무효화한 뒤 한 번 해요
    await waitFor(() => expect(messagesRequests.count).toBe(2));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(
      within(getConversation()).getAllByText(answerText),
    ).toHaveLength(1);
    expect(within(getConversation()).getAllByText(QUESTION)).toHaveLength(1);
    expect(within(getConversation()).getAllByRole("article")).toHaveLength(1);
  });

  it("기존 대화에서 독으로 보낸 후속 질문과 답변은 저장된 턴 뒤에 이어진다 (SEARCH-R1)", async () => {
    const { questionMessageId, answerMessageId, deltas } =
      searchQuestionAnswerStreamResponse;
    const savedQuestions = searchMessagesResponse.items.filter(
      ({ role }) => role === "USER",
    );
    const stream = respondWithControlledSse(SEARCH_QUESTIONS_PATH);
    const { router } = renderLayout(CONVERSATION_PATH, <SearchConversation />);
    expect(
      await within(await screen.findByRole("region", { name: "대화" })).findByText(
        savedQuestions[0].content,
      ),
    ).toBeInTheDocument();

    await sendFromDock(FOLLOW_UP_QUESTION);
    await stream.waitForOpen();
    stream.send("accepted", {
      conversationId: Number(CONVERSATION_ID),
      questionMessageId,
      answerMessageId,
    });
    deltas.forEach((text) => stream.send("delta", { answerMessageId, text }));
    stream.send("completed", { answerMessageId, status: "COMPLETED" });

    const answerText = deltas.join("");
    expect(
      await within(getConversation()).findByText(answerText),
    ).toBeInTheDocument();

    const turns = within(getConversation()).getAllByRole("article");
    const lastTurn = turns[turns.length - 1];

    expect(turns).toHaveLength(savedQuestions.length + 1);
    expect(within(lastTurn).getByText(FOLLOW_UP_QUESTION)).toBeInTheDocument();
    expect(within(lastTurn).getByText(answerText)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(CONVERSATION_PATH);
  });
});
