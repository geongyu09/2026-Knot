import { GetDocumentsResponseDto } from "@api/dto/document";
import { documentsResponse } from "@api/mock/responses/document";
import { mockServer } from "@api/mock/server";
import type {
  DocumentListItem,
  DocumentsResponse,
} from "@api/mock/types/document";
import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { formatDate } from "@utils/formatDate";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider, useParams } from "react-router";
import { describe, expect, it } from "vitest";

import PendingDocumentsCard from ".";

const WORKSPACE_ID = "1";
// 경로 파라미터 자리에 무엇이 와도 잡도록 fetch 상수 대신 패턴을 적어요
const DOCUMENTS_REQUEST = "*/api/v1/workspaces/:workspaceId/documents";
const CONFIRMATION_REQUEST =
  "*/api/v1/workspaces/:workspaceId/documents/:documentId/confirmations/me";
const CARD_TITLE = "확인이 필요한 문서";

const isPending = ({ myConfirmationState }: DocumentListItem) =>
  myConfirmationState === "PENDING";

// 기본 응답에서 내가 아직 확인하지 않은 문서. 카드가 받는 응답과 같은 순서예요
const pendingItems = documentsResponse.items.filter(isPending);
const expectedDocuments = new GetDocumentsResponseDto({
  ...documentsResponse,
  items: pendingItems,
}).items;

// 어느 문서로 갔는지 확인할 수 있게 문서 보기 경로에 표시만 하는 화면을 둬요
function DocumentViewStub() {
  const { documentId } = useParams();

  return <p>문서 보기 화면 {documentId}</p>;
}

const renderPendingDocumentsCard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: PATH_ROUTE.WORKSPACE_HOME, element: <PendingDocumentsCard /> },
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

// 행마다 「확인하기」가 있어, 행을 제목으로 먼저 찾아요
const findRow = async (title: string) => {
  const titleElement = await screen.findByText(title);
  const row = titleElement.closest("li");

  if (row === null) throw new Error(`「${title}」 행을 찾지 못했어요`);

  return row;
};

describe("PendingDocumentsCard", () => {
  it("카드 제목을 보여 준다", async () => {
    renderPendingDocumentsCard();

    const card = await findCard();

    expect(
      within(card).getByRole("heading", { level: 2, name: CARD_TITLE }),
    ).toBeInTheDocument();
  });

  it("내가 아직 확인하지 않은 문서만 서버가 준 순서대로 보여 준다", async () => {
    renderPendingDocumentsCard();

    const rows = await screen.findAllByRole("listitem");

    expect(expectedDocuments.length).toBeGreaterThan(1);
    expect(rows).toHaveLength(expectedDocuments.length);
    rows.forEach((row, index) => {
      const { title, createdAt } = expectedDocuments[index];

      expect(within(row).getByText(title)).toBeInTheDocument();
      expect(within(row).getByText(formatDate(createdAt))).toBeInTheDocument();
      expect(
        within(row).getByRole("button", { name: "확인하기" }),
      ).toBeInTheDocument();
    });
  });

  it("내 확인 상태가 PENDING인 문서를 요청한다", async () => {
    const requestedConfirmations: (string | null)[] = [];
    mockServer.use(
      http.get(DOCUMENTS_REQUEST, ({ request }) => {
        requestedConfirmations.push(
          new URL(request.url).searchParams.get("myConfirmation"),
        );

        return HttpResponse.json({
          ...documentsResponse,
          items: pendingItems,
        });
      }),
    );

    renderPendingDocumentsCard();

    await screen.findAllByRole("listitem");
    expect(requestedConfirmations).toEqual(["PENDING"]);
  });

  it("제목 옆에 서버가 센 확인할 문서 수를 보여 준다", async () => {
    // 받은 문서 수와 다른 값을 줘서, 행을 세지 않고 주제별 문서 수를 더하는지 봐요
    respondWith({
      topics: [
        { topic: "주간 회의", documentCount: 3 },
        { topic: "회원 관리", documentCount: 4 },
      ],
      items: pendingItems,
      nextCursor: null,
    });

    renderPendingDocumentsCard();

    await screen.findAllByRole("listitem");
    expect(within(await findCard()).getByText("7")).toBeInTheDocument();
  });

  it("확인할 문서가 카드에 한 번에 보이는 수(3개)보다 많아도 모든 문서를 행으로 보여 준다", async () => {
    // 기본 응답의 문서 전체를 확인할 문서로 줘요
    const manyDocumentsResponse = {
      ...documentsResponse,
      items: documentsResponse.items.map((item) => ({
        ...item,
        myConfirmationState: "PENDING" as const,
      })),
    };
    const manyDocuments = new GetDocumentsResponseDto(manyDocumentsResponse)
      .items;
    respondWith(manyDocumentsResponse);

    renderPendingDocumentsCard();

    const rows = await screen.findAllByRole("listitem");

    expect(manyDocuments.length).toBeGreaterThan(3);
    expect(rows).toHaveLength(manyDocuments.length);
    rows.forEach((row, index) => {
      expect(
        within(row).getByText(manyDocuments[index].title),
      ).toBeInTheDocument();
    });
  });

  it("「확인하기」를 누르면 그 문서 보기로 이동하고, 확인 요청은 보내지 않는다", async () => {
    let confirmationRequestCount = 0;
    mockServer.use(
      http.put(CONFIRMATION_REQUEST, () => {
        confirmationRequestCount += 1;

        return new HttpResponse(null, { status: 500 });
      }),
    );
    // 첫 문서가 아닌 문서를 눌러, 누른 행의 문서로 가는지 봐요
    const target = expectedDocuments[1];

    renderPendingDocumentsCard();

    const row = await findRow(target.title);
    fireEvent.click(within(row).getByRole("button", { name: "확인하기" }));

    expect(
      await screen.findByText(`문서 보기 화면 ${target.id}`),
    ).toBeInTheDocument();
    expect(confirmationRequestCount).toBe(0);
  });
});
