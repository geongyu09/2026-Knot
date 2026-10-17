import { ThemeProvider } from "@emotion/react";
import { GetMeResponseDto } from "@api/dto/auth";
import { GetWorkspacesResponseDto } from "@api/dto/workspace";
import { AUTH_ME_API_PATH } from "@api/fetch/api/v1/auth/me";
import { meResponse } from "@api/mock/responses/auth";
import { workspacesResponse } from "@api/mock/responses/workspace";
import { mockServer } from "@api/mock/server";
import { authKeys } from "@api/queryKey/auth";
import { workspaceKeys } from "@api/queryKey/workspace";
import { theme } from "@provider/themeProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import EntryRedirect from "../EntryRedirect";
import { PATH_ROUTE } from "../PATH_ROUTE";

import LandingGuard from ".";

interface RenderHomeParams {
  /** 앞서 다른 화면에서 받아 둔 회원 정보와 워크스페이스 목록이 캐시에 남아 있는 상황 */
  hasCachedMe?: boolean;
}

const renderHome = ({ hasCachedMe = false }: RenderHomeParams = {}) => {
  const router = createMemoryRouter(
    [
      {
        path: PATH_ROUTE.HOME,
        element: <LandingGuard landing={<p>랜딩 화면</p>} />,
        children: [{ index: true, element: <EntryRedirect /> }],
      },
      { path: PATH_ROUTE.LOGIN, element: <p>로그인 화면</p> },
      { path: PATH_ROUTE.WORKSPACE, element: <p>워크스페이스 생성 및 참여</p> },
      { path: PATH_ROUTE.WORKSPACE_HOME, element: <p>워크스페이스 홈</p> },
    ],
    { initialEntries: [PATH_ROUTE.HOME] },
  );

  // 테스트마다 새 클라이언트를 써서 앞선 테스트의 캐시를 물려받지 않아요
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (hasCachedMe) {
    queryClient.setQueryData(authKeys.me(), new GetMeResponseDto(meResponse));
    queryClient.setQueryData(workspaceKeys.list(), new GetWorkspacesResponseDto(workspacesResponse));
  }

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );

  return { router };
};

describe("LandingGuard", () => {
  it("로그인하지 않았으면 로그인 화면으로 보내지 않고 랜딩을 보여준다", async () => {
    mockServer.use(
      http.get(`*${AUTH_ME_API_PATH}`, () => new HttpResponse(null, { status: 401 })),
    );

    const { router } = renderHome();

    expect(await screen.findByText("랜딩 화면")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATH_ROUTE.HOME);
  });

  it("로그인 확인이 401이 아닌 이유로 실패해도 랜딩을 보여준다", async () => {
    mockServer.use(
      http.get(`*${AUTH_ME_API_PATH}`, () => new HttpResponse(null, { status: 500 })),
    );

    renderHome();

    expect(await screen.findByText("랜딩 화면")).toBeInTheDocument();
  });

  it("로그인이 풀렸으면 캐시에 남은 회원 정보가 있어도 랜딩을 보여준다", async () => {
    mockServer.use(
      http.get(`*${AUTH_ME_API_PATH}`, () => new HttpResponse(null, { status: 401 })),
    );

    const { router } = renderHome({ hasCachedMe: true });

    expect(await screen.findByText("랜딩 화면")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATH_ROUTE.HOME);
  });

  it("로그인했으면 랜딩을 거치지 않고 워크스페이스로 보낸다", async () => {
    const { router } = renderHome();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/workspace/1");
    });
    expect(screen.queryByText("랜딩 화면")).not.toBeInTheDocument();
  });
});
