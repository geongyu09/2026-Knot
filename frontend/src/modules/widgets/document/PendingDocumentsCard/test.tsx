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
import { delay, http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider, useParams } from "react-router";
import { describe, expect, it } from "vitest";

import PendingDocumentsCard from ".";

const WORKSPACE_ID = "1";
// 경로 파라미터 자리에 무엇이 와도 잡도록 fetch 상수 대신 패턴을 적어요
const DOCUMENTS_REQUEST = "*/api/v1/workspaces/:workspaceId/documents";
const CONFIRMATION_REQUEST =
  "*/api/v1/workspaces/:workspaceId/documents/:documentId/confirmations/me";
const CARD_TITLE = "확인이 필요한 문서";
const LOADING_LABEL = "확인이 필요한 문서를 불러오고 있어요";

const isPending = ({ myConfirmationState }: DocumentListItem) =>
  myConfirmationState === "PENDING";

// 기본 응답에서 내가 아직 확인하지 않은 문서. 카드가 받는 응답과 같은 순서예요
const pendingItems = documentsResponse.items.filter(isPending);
const pendingDocumentsResponse = {
  ...documentsResponse,
  items: pendingItems,
} satisfies DocumentsResponse;
const expectedDocuments = new GetDocumentsResponseDto(pendingDocumentsResponse)
  .items;

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

// 제목 옆의 문서 수는 숫자만 있는 글이에요
const queryCount = (card: HTMLElement) => within(card).queryByText(/^\d+$/);

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

        return HttpResponse.json(pendingDocumentsResponse);
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

  it("불러오는 동안에는 제목은 그대로 두고 문서 수 없이 불러오는 중이라고 알리고, 문서를 받으면 행으로 바꾼다", async () => {
    mockServer.use(
      http.get(DOCUMENTS_REQUEST, async () => {
        await delay(50);

        return HttpResponse.json(pendingDocumentsResponse);
      }),
    );

    renderPendingDocumentsCard();

    const card = await findCard();

    expect(
      within(card).getByRole("status", { name: LOADING_LABEL }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("heading", { level: 2, name: CARD_TITLE }),
    ).toBeInTheDocument();
    expect(queryCount(card)).not.toBeInTheDocument();

    expect(await screen.findAllByRole("listitem")).toHaveLength(
      expectedDocuments.length,
    );
    expect(
      screen.queryByRole("status", { name: LOADING_LABEL }),
    ).not.toBeInTheDocument();
    // 불러온 뒤에는 문서를 받은 카드가 새로 그려져서, 카드를 다시 찾아요
    expect(queryCount(await findCard())).toBeInTheDocument();
  });

  it("확인할 문서가 없으면 제목은 그대로 두고 문서 수 없이 아직 문서가 없다고 알린다", async () => {
    respondWith({ topics: [], items: [], nextCursor: null });

    renderPendingDocumentsCard();

    expect(await screen.findByText("아직 문서가 없어요")).toBeInTheDocument();

    // 불러온 뒤에는 문서 없음 카드가 새로 그려져서, 안내가 보인 뒤에 카드를 찾아요
    const card = await findCard();

    expect(
      within(card).getByText("녹음을 끝내면 정리된 문서가 여기에 쌓여요"),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("heading", { level: 2, name: CARD_TITLE }),
    ).toBeInTheDocument();
    expect(queryCount(card)).not.toBeInTheDocument();
    expect(within(card).queryByRole("listitem")).not.toBeInTheDocument();
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
