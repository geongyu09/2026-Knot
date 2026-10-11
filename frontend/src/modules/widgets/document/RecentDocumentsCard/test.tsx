import { GetDocumentsResponseDto } from "@api/dto/document";
import { documentsResponse } from "@api/mock/responses/document";
import { mockServer } from "@api/mock/server";
import type { DocumentsResponse } from "@api/mock/types/document";
import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { formatDate } from "@utils/formatDate";
import { formatDurationFromSeconds } from "@utils/formatDurationFromSeconds";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider, useParams } from "react-router";
import { describe, expect, it } from "vitest";

import RecentDocumentsCard from ".";

// 카드가 한 번에 요청하는 문서 수. useRecentDocumentsQuery의 값과 같아요
const RECENT_DOCUMENT_COUNT = 3;
const expected = new GetDocumentsResponseDto(documentsResponse);
// mock 응답은 최신순이라 앞의 세 개가 가장 최근 문서예요
const expectedRecentDocuments = expected.items.slice(0, RECENT_DOCUMENT_COUNT);
const WORKSPACE_ID = "1";
// 경로 파라미터 자리에 무엇이 와도 잡도록 fetch 상수 대신 패턴을 적어요
const DOCUMENTS_REQUEST = "*/api/v1/workspaces/:workspaceId/documents";
const CARD_TITLE = "최근 추가된 문서";

// 어느 문서로 갔는지 확인할 수 있게 문서 보기 경로에 표시만 하는 화면을 둬요
function DocumentViewStub() {
  const { documentId } = useParams();

  return <p>문서 보기 화면 {documentId}</p>;
}

const renderRecentDocumentsCard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: PATH_ROUTE.WORKSPACE_HOME, element: <RecentDocumentsCard /> },
      { path: PATH_ROUTE.DOCUMENTS, element: <p>문서 목록 화면</p> },
      { path: PATH_ROUTE.DOCUMENT, element: <DocumentViewStub /> },
    ],
    {
      initialEntries: [
        getRouterPath({
          routeKey: "WORKSPACE_HOME",
          params: { workspaceId: WORKSPACE_ID },
        }),
      ],
    },
  );

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

const respondWith = (response: DocumentsResponse) =>
  mockServer.use(
    http.get(DOCUMENTS_REQUEST, () => HttpResponse.json(response)),
  );

const findCard = () => screen.findByRole("region", { name: CARD_TITLE });

// 문서 행은 카드 안 목록의 링크예요. 「전체 보기」 링크는 목록 밖에 있어요
const findRows = async () =>
  within(await within(await findCard()).findByRole("list")).getAllByRole(
    "link",
  );

describe("RecentDocumentsCard", () => {
  it("카드 제목과 전체 보기를 보여 준다", async () => {
    renderRecentDocumentsCard();

    const card = await findCard();

    expect(
      within(card).getByRole("heading", { level: 2, name: CARD_TITLE }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "전체 보기" }),
    ).toBeInTheDocument();
  });

  it("가장 최근 문서 세 개를 서버가 준 순서대로 보여 준다", async () => {
    renderRecentDocumentsCard();

    const rows = await findRows();

    expect(rows).toHaveLength(RECENT_DOCUMENT_COUNT);
    rows.forEach((row, index) => {
      expect(
        within(row).getByText(expectedRecentDocuments[index].title),
      ).toBeInTheDocument();
    });
  });

  it("행마다 만든 날짜와 녹음 길이를 보여 준다", async () => {
    renderRecentDocumentsCard();

    const rows = await findRows();

    rows.forEach((row, index) => {
      const { createdAt, recordingDurationSeconds } =
        expectedRecentDocuments[index];

      expect(within(row).getByText(formatDate(createdAt))).toBeInTheDocument();
      expect(
        within(row).getByText(
          formatDurationFromSeconds(recordingDurationSeconds),
        ),
      ).toBeInTheDocument();
    });
  });

  it("문서를 세 개만, 한 번 요청한다", async () => {
    const requestedParams: URLSearchParams[] = [];
    mockServer.use(
      http.get(DOCUMENTS_REQUEST, ({ request }) => {
        requestedParams.push(new URL(request.url).searchParams);

        // 핸들러 없이 넘기면 기본 핸들러가 이어서 답해요
        return undefined;
      }),
    );

    renderRecentDocumentsCard();
    await findRows();

    expect(requestedParams).toHaveLength(1);
    expect(requestedParams[0].get("size")).toBe(String(RECENT_DOCUMENT_COUNT));
    expect(requestedParams[0].get("cursor")).toBeNull();
  });

  it("문서가 세 개보다 적으면 있는 만큼 보여 준다", async () => {
    const [onlyDocument] = documentsResponse.items;
    respondWith({ ...documentsResponse, items: [onlyDocument] });

    renderRecentDocumentsCard();

    const rows = await findRows();

    expect(rows).toHaveLength(1);
    expect(
      within(rows[0]).getByText(expectedRecentDocuments[0].title),
    ).toBeInTheDocument();
  });

  it("행을 누르면 그 문서 보기로 간다", async () => {
    renderRecentDocumentsCard();

    const [, secondRow] = await findRows();
    fireEvent.click(secondRow);

    expect(
      await screen.findByText(
        `문서 보기 화면 ${expectedRecentDocuments[1].id}`,
      ),
    ).toBeInTheDocument();
  });

  it("전체 보기를 누르면 문서 목록으로 간다", async () => {
    renderRecentDocumentsCard();

    fireEvent.click(
      within(await findCard()).getByRole("link", { name: "전체 보기" }),
    );

    await waitFor(() =>
      expect(screen.getByText("문서 목록 화면")).toBeInTheDocument(),
    );
  });
});
