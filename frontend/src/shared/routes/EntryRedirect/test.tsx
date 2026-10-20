import { ThemeProvider } from "@emotion/react";
import { AUTH_ME_API_PATH } from "@api/fetch/api/v1/auth/me";
import { WORKSPACES_API_PATH } from "@api/fetch/api/v1/workspaces";
import { workspacesResponse } from "@api/mock/responses/workspace";
import { mockServer } from "@api/mock/server";
import { theme } from "@provider/themeProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { readAuthReturnPath, saveAuthReturnPath } from "@utils/authReturnPath";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { PATH_ROUTE } from "../PATH_ROUTE";

import EntryRedirect from ".";

const ELSEWHERE_PATH = "/elsewhere";
/** 로그인 전 초대 참여가 401로 끝나며 기억해 둔 복귀 주소 */
const INVITE_PATH = "/invite/X35D3S";

const renderEntry = () => {
  const router = createMemoryRouter(
    [
      { path: ELSEWHERE_PATH, element: <p>다른 화면</p> },
      { path: PATH_ROUTE.HOME, element: <EntryRedirect /> },
      { path: PATH_ROUTE.LOGIN, element: <p>로그인 화면</p> },
      { path: PATH_ROUTE.WORKSPACE, element: <p>워크스페이스 생성 및 참여</p> },
      { path: PATH_ROUTE.WORKSPACE_HOME, element: <p>워크스페이스 홈</p> },
      { path: PATH_ROUTE.INVITE, element: <p>초대 링크</p> },
    ],
    { initialEntries: [ELSEWHERE_PATH, PATH_ROUTE.HOME] },
  );

  // 테스트마다 새 클라이언트를 써서 앞선 테스트의 캐시를 물려받지 않아요
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );

  return { router };
};

/** 워크스페이스 목록 요청 횟수를 세요. 응답은 기본 핸들러와 같아요 */
const countWorkspacesRequests = () => {
  const counter = { count: 0 };

  mockServer.use(
    http.get(`*${WORKSPACES_API_PATH}`, () => {
      counter.count += 1;

      return HttpResponse.json(workspacesResponse);
    }),
  );

  return counter;
};

describe("EntryRedirect", () => {
  afterEach(() => sessionStorage.clear());

  it("판정하는 동안 로딩을 알린다", () => {
    renderEntry();

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("로그인하지 않았으면 로그인 화면으로 보낸다", async () => {
    mockServer.use(
      http.get(`*${AUTH_ME_API_PATH}`, () => new HttpResponse(null, { status: 401 })),
    );

    const { router } = renderEntry();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATH_ROUTE.LOGIN);
    });
  });

  it("마지막으로 본 워크스페이스가 있으면 그 워크스페이스 홈으로 보낸다", async () => {
    const { router } = renderEntry();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/workspace/1");
    });
  });

  it("첫 워크스페이스로 보낼 때는 목록의 첫 워크스페이스를 쓴다", async () => {
    mockServer.use(
      http.get(`*${WORKSPACES_API_PATH}`, () =>
        HttpResponse.json({
          lastViewedWorkspaceId: null,
          workspaces: [{ id: 42, name: "Knot 팀" }],
        }),
      ),
    );

    const { router } = renderEntry();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/workspace/42");
    });
  });

  it("속한 워크스페이스가 없으면 워크스페이스 생성 및 참여 화면으로 보낸다", async () => {
    mockServer.use(
      http.get(`*${WORKSPACES_API_PATH}`, () =>
        HttpResponse.json({ lastViewedWorkspaceId: null, workspaces: [] }),
      ),
    );

    const { router } = renderEntry();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATH_ROUTE.WORKSPACE);
    });
  });

  it("워크스페이스 목록 조회가 실패하면 화면을 옮기지 않고 다시 시도를 안내한다", async () => {
    mockServer.use(
      http.get(`*${WORKSPACES_API_PATH}`, () => new HttpResponse(null, { status: 500 })),
    );

    const { router } = renderEntry();

    expect(
      await screen.findByRole("button", { name: "다시 시도" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATH_ROUTE.HOME);
  });

  it("기억해 둔 복귀 주소가 있으면 로그인 확인 뒤 그 주소로 replace 이동하고 저장값을 지우며 워크스페이스 목록은 조회하지 않는다", async () => {
    saveAuthReturnPath(INVITE_PATH);
    const workspacesRequests = countWorkspacesRequests();

    const { router } = renderEntry();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(INVITE_PATH);
    });
    expect(readAuthReturnPath()).toBeUndefined();
    expect(workspacesRequests.count).toBe(0);

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe(ELSEWHERE_PATH);
  });

  it("기억해 둔 복귀 주소가 있어도 로그인하지 않았으면 로그인 화면으로 보내고 저장값은 남긴다", async () => {
    saveAuthReturnPath(INVITE_PATH);
    mockServer.use(
      http.get(
        `*${AUTH_ME_API_PATH}`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    const { router } = renderEntry();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATH_ROUTE.LOGIN);
    });
    expect(readAuthReturnPath()).toBe(INVITE_PATH);
  });
});
