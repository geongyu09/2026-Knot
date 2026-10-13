import { GetMeResponseDto } from "@api/dto/auth";
import { meResponse } from "@api/mock/responses/auth";
import { mockServer } from "@api/mock/server";
import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import WorkspaceHomePage from ".";

const WORKSPACE_ID = "1";
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: WORKSPACE_ID },
});
// 경로 파라미터 자리에 무엇이 와도 잡도록 fetch 상수 대신 패턴을 적어요
const DOCUMENTS_REQUEST = "*/api/v1/workspaces/:workspaceId/documents";
const GREETING = `반가워요, ${new GetMeResponseDto(meResponse).nickname} 님`;
const RECENT_DOCUMENTS_TITLE = "최근 추가된 문서";
const CURRENT_RECORDING_TITLE = "진행 중인 녹음";
const INVITE_MEMBER_TITLE = "팀원 초대";

const renderHomePage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: PATH_ROUTE.WORKSPACE_HOME, element: <WorkspaceHomePage /> }],
    { initialEntries: [HOME_PATH] },
  );

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

const findCardTitle = (name: string) =>
  screen.findByRole("heading", { level: 2, name });

describe("WorkspaceHomePage", () => {
  it("인사말과 최근 추가된 문서 · 진행 중인 녹음 · 팀원 초대 카드를 보여 준다", async () => {
    renderHomePage();

    expect(
      await screen.findByRole("heading", { level: 1, name: GREETING }),
    ).toBeInTheDocument();
    expect(await findCardTitle(RECENT_DOCUMENTS_TITLE)).toBeInTheDocument();
    expect(await findCardTitle(CURRENT_RECORDING_TITLE)).toBeInTheDocument();
    expect(await findCardTitle(INVITE_MEMBER_TITLE)).toBeInTheDocument();
  });

  it("최근 문서를 불러오지 못해도 다른 카드는 그대로 보여 준다", async () => {
    mockServer.use(
      http.get(
        DOCUMENTS_REQUEST,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderHomePage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "목록을 불러오지 못했어요. 다시 시도해 주세요.",
    );
    expect(await findCardTitle(RECENT_DOCUMENTS_TITLE)).toBeInTheDocument();
    expect(await findCardTitle(CURRENT_RECORDING_TITLE)).toBeInTheDocument();
    expect(await findCardTitle(INVITE_MEMBER_TITLE)).toBeInTheDocument();
  });
});
