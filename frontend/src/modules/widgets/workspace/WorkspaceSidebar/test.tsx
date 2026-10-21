import { GetDocumentsResponseDto } from "@api/dto/document";
import { GetWorkspaceResponseDto } from "@api/dto/workspace";
import { documentsResponse } from "@api/mock/responses/document";
import { workspaceDetailResponse } from "@api/mock/responses/workspace";
import { mockServer } from "@api/mock/server";
import { ThemeProvider } from "@emotion/react";
import { DialogProvider } from "@provider/context/dialogContext";
import { ToastProvider } from "@provider/context/toastContext";
import { theme } from "@provider/themeProvider";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import WorkspaceSidebar from ".";

// 경로 파라미터 자리에 무엇이 와도 잡도록 fetch 상수 대신 패턴을 적어요
const DOCUMENTS_REQUEST = "*/api/v1/workspaces/:workspaceId/documents";
const LOAD_FAILED_NOTICE = "목록을 불러오지 못했어요";

const expectedWorkspace = new GetWorkspaceResponseDto(workspaceDetailResponse);
const expectedDocuments = new GetDocumentsResponseDto(documentsResponse);

const WORKSPACE_ID = 1;
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: String(WORKSPACE_ID) },
});

const renderSidebar = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: (
          <ToastProvider>
            <Outlet />
          </ToastProvider>
        ),
        children: [
          { path: PATH_ROUTE.WORKSPACE_HOME, element: <WorkspaceSidebar /> },
        ],
      },
    ],
    { initialEntries: [HOME_PATH] },
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

  return screen.getByRole("complementary", { name: "워크스페이스 사이드바" });
};

describe("WorkspaceSidebar", () => {
  it("워크스페이스 이름이 적힌 메뉴 버튼과 문서 목록을 보여 준다", async () => {
    const sidebar = renderSidebar();

    expect(
      await within(sidebar).findByText(expectedWorkspace.name),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: "워크스페이스 메뉴" }),
    ).toBeInTheDocument();

    // 폴더 행의 이름은 폴더 이름과 문서 수를 이은 글이라, 폴더 이름 뒤에 문서 수만 오는 행을 찾아요
    for (const { topic } of expectedDocuments.topics) {
      expect(
        await within(sidebar).findByRole("button", {
          name: (name) =>
            name.startsWith(topic) && /^\s*\d+$/.test(name.slice(topic.length)),
        }),
      ).toBeInTheDocument();
    }
    // 불러오는 동안의 문서 목록도 이름이 같아, 폴더 행이 나온 뒤에 찾아요
    expect(
      within(sidebar).getByRole("navigation", { name: "문서" }),
    ).toBeInTheDocument();
  });

  it("문서 목록을 불러오지 못해도 워크스페이스 이름은 그대로 보여 준다", async () => {
    mockServer.use(
      http.get(
        DOCUMENTS_REQUEST,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const sidebar = renderSidebar();

    expect(
      within(await within(sidebar).findByRole("alert")).getByText(
        LOAD_FAILED_NOTICE,
      ),
    ).toBeInTheDocument();
    expect(
      await within(sidebar).findByText(expectedWorkspace.name),
    ).toBeInTheDocument();
  });
});
