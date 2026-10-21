import { GetSearchConversationsResponseDto } from "@api/dto/search";
import { AUTH_REFRESH_API_PATH } from "@api/fetch/api/v1/auth/refresh";
import { searchConversationsResponse } from "@api/mock/responses/search";
import { mockServer } from "@api/mock/server";
import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import ChatListDrawer from ".";

const WORKSPACE_ID = "1";
const CHAT_PATH = getRouterPath({
  routeKey: "CHAT",
  params: { workspaceId: WORKSPACE_ID },
});
const SESSION_PATH = getRouterPath({
  routeKey: "CHAT_SESSION",
  params: { workspaceId: WORKSPACE_ID, sessionId: "100" },
});

// 경로 파라미터 자리에 무엇이 와도 잡도록 fetch 상수 대신 패턴을 적어요
const CONVERSATIONS_REQUEST =
  "*/api/v1/workspaces/:workspaceId/search/conversations";
const LOAD_FAILED_NOTICE = "대화 목록을 불러오지 못했어요";
const EMPTY_NOTICE = "아직 나눈 대화가 없어요";

const expected = new GetSearchConversationsResponseDto(
  searchConversationsResponse,
);

const renderDrawer = (initialPath = SESSION_PATH) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: PATH_ROUTE.CHAT, element: <ChatListDrawer /> },
      { path: PATH_ROUTE.CHAT_SESSION, element: <ChatListDrawer /> },
      // 이동을 확인할 수 있게 로그인 경로에 표시만 하는 화면을 둬요
      { path: PATH_ROUTE.LOGIN, element: <p>로그인 화면</p> },
    ],
    { initialEntries: [initialPath] },
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

describe("ChatListDrawer", () => {
  it("제목과 새 채팅 버튼, 워크스페이스의 대화 목록을 보여준다", async () => {
    renderDrawer();

    expect(
      screen.getByRole("heading", { name: "대화" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "새 채팅" }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(expected.items[0].title),
    ).toBeInTheDocument();
    expect(screen.getByText(expected.items[1].title)).toBeInTheDocument();
  });

  it("보고 있는 대화를 현재 항목으로 표시한다", async () => {
    renderDrawer();

    const openedRow = await screen.findByText(expected.items[0].title);

    expect(openedRow.closest("button")).toHaveAttribute("aria-current", "page");
  });

  it("목록에서 대화를 고르면 그 대화로 이동한다", async () => {
    const { router } = renderDrawer(CHAT_PATH);

    const row = await screen.findByText(expected.items[1].title);
    await act(async () => {
      fireEvent.click(row);
    });

    expect(router.state.location.pathname).toBe(
      getRouterPath({
        routeKey: "CHAT_SESSION",
        params: {
          workspaceId: WORKSPACE_ID,
          sessionId: String(expected.items[1].id),
        },
      }),
    );
  });

  it("새 채팅을 누르면 세션 없는 탐색 화면으로 이동한다", async () => {
    const { router } = renderDrawer();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "새 채팅" }));
    });

    expect(router.state.location.pathname).toBe(CHAT_PATH);
  });

  it("대화가 하나도 없으면 실패 안내 없이 빈 안내를 보여준다", async () => {
    mockServer.use(
      http.get(CONVERSATIONS_REQUEST, () =>
        HttpResponse.json({ items: [], nextCursor: null }),
      ),
    );

    renderDrawer();

    expect(await screen.findByText(EMPTY_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["잘못된 요청(400)", () => new HttpResponse(null, { status: 400 })],
    ["서버 오류(500)", () => new HttpResponse(null, { status: 500 })],
    ["네트워크 오류", () => HttpResponse.error()],
  ])(
    "%s로 대화 목록을 불러오지 못하면 빈 안내 대신 실패 안내와 다시 시도를 보여준다",
    async (_, respond) => {
      mockServer.use(http.get(CONVERSATIONS_REQUEST, respond));

      renderDrawer();

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(LOAD_FAILED_NOTICE);
      expect(
        within(alert).getByRole("button", { name: "다시 시도" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(EMPTY_NOTICE)).not.toBeInTheDocument();
      // 목록만 실패한 것이라 드로어 제목과 새 채팅은 그대로 둬요
      expect(screen.getByRole("heading", { name: "대화" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "새 채팅" }),
      ).toBeInTheDocument();
    },
  );

  it("다시 시도를 누르면 대화 목록만 다시 받아 보여준다", async () => {
    let attempts = 0;
    mockServer.use(
      http.get(CONVERSATIONS_REQUEST, () => {
        attempts += 1;
        if (attempts === 1) return new HttpResponse(null, { status: 500 });

        return HttpResponse.json(searchConversationsResponse);
      }),
    );
    renderDrawer();

    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: "다시 시도" }),
      );
    });

    expect(
      await screen.findByText(expected.items[0].title),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("로그인이 풀렸으면(401) 실패 안내 없이 로그인 화면으로 보낸다", async () => {
    mockServer.use(
      http.get(
        CONVERSATIONS_REQUEST,
        () => new HttpResponse(null, { status: 401 }),
      ),
      // 토큰 재발급도 실패해 원래 요청의 401이 화면까지 와요
      http.post(
        `*${AUTH_REFRESH_API_PATH}`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    const { router } = renderDrawer();

    expect(await screen.findByText("로그인 화면")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATH_ROUTE.LOGIN);
  });
});
