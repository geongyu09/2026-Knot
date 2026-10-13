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
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
const LOAD_FAILED_NOTICE = "목록을 불러오지 못했어요. 다시 시도해 주세요.";

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

// 이동을 확인할 수 있게 로그인 · 워크스페이스 선택 경로에도 표시만 하는 화면을 둬요
const renderPendingDocumentsCard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: PATH_ROUTE.WORKSPACE_HOME, element: <PendingDocumentsCard /> },
      { path: PATH_ROUTE.DOCUMENT, element: <DocumentViewStub /> },
      { path: PATH_ROUTE.LOGIN, element: <p>로그인 화면</p> },
      { path: PATH_ROUTE.WORKSPACE, element: <p>워크스페이스 선택 화면</p> },
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

const clickRetry = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

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

  it.each([
    ["잘못된 요청(400)", () => new HttpResponse(null, { status: 400 })],
    ["서버 오류(500)", () => new HttpResponse(null, { status: 500 })],
    ["네트워크 오류", () => HttpResponse.error()],
  ])(
    "%s로 불러오지 못하면 제목은 그대로 두고 문서 수 없이 안내와 「다시 시도」를 보여 준다",
    async (_, respond) => {
      mockServer.use(http.get(DOCUMENTS_REQUEST, respond));

      renderPendingDocumentsCard();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        LOAD_FAILED_NOTICE,
      );

      // 실패한 뒤에는 실패 카드가 새로 그려져서, 안내가 보인 뒤에 카드를 찾아요
      const card = await findCard();

      expect(
        within(card).getByRole("button", { name: "다시 시도" }),
      ).toBeInTheDocument();
      expect(
        within(card).getByRole("heading", { level: 2, name: CARD_TITLE }),
      ).toBeInTheDocument();
      expect(queryCount(card)).not.toBeInTheDocument();
    },
  );

  it("「다시 시도」를 누르면 다시 불러와 문서 행을 보여 준다", async () => {
    let requestCount = 0;
    mockServer.use(
      http.get(DOCUMENTS_REQUEST, () => {
        requestCount += 1;

        return requestCount === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(pendingDocumentsResponse);
      }),
    );

    renderPendingDocumentsCard();
    await clickRetry();

    expect(await screen.findAllByRole("listitem")).toHaveLength(
      expectedDocuments.length,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(requestCount).toBe(2);
  });

  it("문서를 보는 동안 다시 불러오기가 서버 오류로 실패하면 받은 문서를 계속 보여 준다", async () => {
    let failedRequestCount = 0;
    renderPendingDocumentsCard();
    await screen.findAllByRole("listitem");

    mockServer.use(
      http.get(DOCUMENTS_REQUEST, () => {
        failedRequestCount += 1;

        return new HttpResponse(null, { status: 500 });
      }),
    );
    // 다른 탭에 다녀오면 문서를 다시 받아요
    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(failedRequestCount).toBe(1));

    expect(screen.getAllByRole("listitem")).toHaveLength(
      expectedDocuments.length,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("이어 받는 도중 한 번이라도 실패하면 받은 문서를 보여 주지 않고 불러오지 못했다고 알린다", async () => {
    const [firstItem] = pendingItems;
    mockServer.use(
      http.get(DOCUMENTS_REQUEST, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");

        // 첫 페이지는 문서 하나와 다음 페이지가 있다는 표시를 주고, 다음 페이지 요청은 실패해요
        return cursor === null
          ? HttpResponse.json({
              ...pendingDocumentsResponse,
              items: [firstItem],
              nextCursor: String(firstItem.id),
            })
          : new HttpResponse(null, { status: 500 });
      }),
    );

    renderPendingDocumentsCard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      LOAD_FAILED_NOTICE,
    );
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it.each([
    ["로그인이 풀렸으면(401)", "로그인 화면", 401],
    ["워크스페이스 멤버가 아니면(403)", "워크스페이스 선택 화면", 403],
    ["없는 워크스페이스면(404)", "워크스페이스 선택 화면", 404],
  ])(
    "%s 불러오지 못했다는 안내를 보여 주지 않고 %s으로 보낸다",
    async (_, destination, status) => {
      mockServer.use(
        http.get(DOCUMENTS_REQUEST, () => new HttpResponse(null, { status })),
      );
      // 다른 화면으로 가면 카드가 사라져, 간 뒤에는 안내가 있었는지 알 수 없어요. 가기 전까지 그려진 화면을 모두 지켜봐요
      let isAlertShown = false;
      const observer = new MutationObserver(() => {
        if (screen.queryByRole("alert") !== null) isAlertShown = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });

      renderPendingDocumentsCard();

      try {
        expect(await screen.findByText(destination)).toBeInTheDocument();
      } finally {
        observer.disconnect();
      }
      expect(isAlertShown).toBe(false);
    },
  );

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
