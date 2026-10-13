import { GetDocumentsResponseDto } from "@api/dto/document";
import { documentsResponse } from "@api/mock/responses/document";
import { mockServer } from "@api/mock/server";
import type { DocumentsResponse } from "@api/mock/types/document";
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
import { delay, http, HttpResponse } from "msw";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "react-router";
import { describe, expect, it } from "vitest";

import DocumentTree from ".";

const expected = new GetDocumentsResponseDto(documentsResponse);
const WORKSPACE_ID = "1";
const OTHER_WORKSPACE_ID = "2";
// 경로 파라미터 자리에 무엇이 와도 잡도록 fetch 상수 대신 패턴을 적어요
const DOCUMENTS_REQUEST = "*/api/v1/workspaces/:workspaceId/documents";
const LOADING_LABEL = "문서 목록을 불러오고 있어요";
const EMPTY_NOTICE = "아직 문서가 없어요";
const LOAD_FAILED_NOTICE = "목록을 불러오지 못했어요";
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: WORKSPACE_ID },
});

const documentPath = (documentId: number | string) =>
  getRouterPath({
    routeKey: "DOCUMENT",
    params: { workspaceId: WORKSPACE_ID, documentId: String(documentId) },
  });

const documentsOf = (topic: string) =>
  expected.items.filter((item) => item.topic === topic);

const titlesOf = (topic: string) =>
  documentsOf(topic).map(({ title }) => title);

// 기본 응답의 주제는 이름순이에요
const [firstTopic, secondTopic, thirdTopic] = expected.topics.map(
  ({ topic }) => topic,
);
const [currentDocument, siblingDocument] = documentsOf(secondTopic);
const [documentInThirdTopic] = documentsOf(thirdTopic);

// 사이드바처럼 화면이 바뀌어도 문서 목록은 그대로 남도록, 화면들을 감싸는 자리에 둬요
function SidebarStub() {
  return (
    <>
      <DocumentTree />
      <Outlet />
    </>
  );
}

// 어느 문서로 갔는지 확인할 수 있게 문서 보기 경로에 표시만 하는 화면을 둬요
function DocumentViewStub() {
  const { documentId } = useParams();

  return <p>문서 보기 화면 {documentId}</p>;
}

const renderDocumentTree = (initialEntry = HOME_PATH) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <SidebarStub />,
        children: [
          { path: PATH_ROUTE.WORKSPACE_HOME, element: <p>홈 화면</p> },
          { path: PATH_ROUTE.DOCUMENT, element: <DocumentViewStub /> },
        ],
      },
      // 이동을 확인할 수 있게 로그인 · 워크스페이스 선택 경로에 표시만 하는 화면을 둬요
      { path: PATH_ROUTE.LOGIN, element: <p>로그인 화면</p> },
      { path: PATH_ROUTE.WORKSPACE, element: <p>워크스페이스 선택 화면</p> },
    ],
    { initialEntries: [initialEntry] },
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

const respondWith = (response: DocumentsResponse) =>
  mockServer.use(
    http.get(DOCUMENTS_REQUEST, () => HttpResponse.json(response)),
  );

// 문서를 받은 목록 안의 버튼은 폴더 행뿐이에요
const findFolderRows = () => screen.findAllByRole("button");

const getTree = () => screen.getByRole("navigation", { name: "문서" });

const clickRetry = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

// 폴더 행의 이름은 폴더 이름과 문서 수를 이은 글이라 폴더 이름으로 시작하는 것을 찾아요
const findFolderRow = (topic: string) =>
  screen.findByRole("button", { name: (name) => name.startsWith(topic) });

const getFolderRow = (topic: string) =>
  screen.getByRole("button", { name: (name) => name.startsWith(topic) });

const getDocumentRowTitles = () =>
  screen.queryAllByRole("link").map(({ textContent }) => textContent);

describe("DocumentTree", () => {
  it("머리말 「문서」를 보여 주고, 서버가 주제를 어떤 순서로 줘도 폴더를 이름순으로 놓는다", async () => {
    const [first, second, third] = documentsResponse.topics;
    respondWith({ ...documentsResponse, topics: [third, first, second] });

    renderDocumentTree();

    const folderRows = await findFolderRows();

    expect(
      screen.getByRole("navigation", { name: "문서" }),
    ).toBeInTheDocument();
    expect(folderRows).toHaveLength(expected.topics.length);
    expected.topics.forEach(({ topic }, index) => {
      expect(within(folderRows[index]).getByText(topic)).toBeInTheDocument();
    });
  });

  it("폴더 이름 옆에 서버가 준 문서 수를 보여 준다", async () => {
    // 받은 문서 수와 다른 값을 줘서, 행을 세지 않고 서버 값을 쓰는지 봐요
    const extraCount = 10;
    const response = {
      ...documentsResponse,
      topics: documentsResponse.topics.map((topic) => ({
        ...topic,
        documentCount: topic.documentCount + extraCount,
      })),
    };
    respondWith(response);

    renderDocumentTree();

    for (const { topic, documentCount } of new GetDocumentsResponseDto(response)
      .topics) {
      expect(
        within(await findFolderRow(topic)).getByText(String(documentCount)),
      ).toBeInTheDocument();
    }
  });

  it("문서 보기가 아닌 화면에서는 폴더를 모두 접어 둔다", async () => {
    renderDocumentTree(HOME_PATH);

    const folderRows = await findFolderRows();

    folderRows.forEach((folderRow) => {
      expect(folderRow).toHaveAttribute("aria-expanded", "false");
    });
    expect(getDocumentRowTitles()).toEqual([]);
  });

  it("문서 보기에서는 그 문서의 폴더만 펼쳐 문서를 보여 주고, 그 문서 행을 지금 보는 문서로 표시한다", async () => {
    renderDocumentTree(documentPath(currentDocument.id));

    expect(await findFolderRow(secondTopic)).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(getFolderRow(firstTopic)).toHaveAttribute("aria-expanded", "false");
    expect(getFolderRow(thirdTopic)).toHaveAttribute("aria-expanded", "false");
    expect(getDocumentRowTitles()).toEqual(titlesOf(secondTopic));
    expect(
      screen.getByRole("link", { name: currentDocument.title }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: siblingDocument.title }),
    ).not.toHaveAttribute("aria-current");
  });

  it("서버가 문서를 어떤 순서로 줘도 폴더 안에서는 최근 녹음에서 나온 문서를 위에 놓는다", async () => {
    // 기본 응답의 문서는 최근 녹음순이라, 순서를 뒤집어서 줘요
    respondWith({
      ...documentsResponse,
      items: [...documentsResponse.items].reverse(),
    });
    renderDocumentTree();

    fireEvent.click(await findFolderRow(firstTopic));

    expect(titlesOf(firstTopic).length).toBeGreaterThan(1);
    expect(getDocumentRowTitles()).toEqual(titlesOf(firstTopic));
  });

  it("폴더를 누르면 펼쳐 그 폴더의 문서를 보여 주고, 다시 누르면 접는다", async () => {
    renderDocumentTree();

    fireEvent.click(await findFolderRow(firstTopic));

    expect(getFolderRow(firstTopic)).toHaveAttribute("aria-expanded", "true");
    expect(getDocumentRowTitles()).toEqual(titlesOf(firstTopic));

    fireEvent.click(getFolderRow(firstTopic));

    expect(getFolderRow(firstTopic)).toHaveAttribute("aria-expanded", "false");
    expect(getDocumentRowTitles()).toEqual([]);
  });

  it("문서 행을 누르면 그 문서 보기로 가고, 그 행이 지금 보는 문서가 된다", async () => {
    renderDocumentTree();

    fireEvent.click(await findFolderRow(thirdTopic));
    fireEvent.click(
      screen.getByRole("link", { name: documentInThirdTopic.title }),
    );

    expect(
      await screen.findByText(`문서 보기 화면 ${documentInThirdTopic.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: documentInThirdTopic.title }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("다른 문서로 옮기면 누른 적 없는 폴더는 지금 보는 문서를 따라 펼치고 접는다", async () => {
    const { router } = renderDocumentTree(documentPath(currentDocument.id));

    expect(await findFolderRow(secondTopic)).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await act(() => router.navigate(documentPath(documentInThirdTopic.id)));

    expect(getFolderRow(thirdTopic)).toHaveAttribute("aria-expanded", "true");
    expect(getFolderRow(secondTopic)).toHaveAttribute("aria-expanded", "false");
    expect(getDocumentRowTitles()).toEqual(titlesOf(thirdTopic));
  });

  it("사용자가 펼친 폴더는 다른 문서로 옮겨도 펼쳐 둔다", async () => {
    const { router } = renderDocumentTree(documentPath(currentDocument.id));

    fireEvent.click(await findFolderRow(firstTopic));
    await act(() => router.navigate(documentPath(documentInThirdTopic.id)));

    expect(getFolderRow(firstTopic)).toHaveAttribute("aria-expanded", "true");
    expect(getFolderRow(thirdTopic)).toHaveAttribute("aria-expanded", "true");
    expect(getFolderRow(secondTopic)).toHaveAttribute("aria-expanded", "false");
  });

  it("지금 보는 문서의 폴더도 누르면 접고, 다른 문서로 옮겼다 돌아와도 접어 둔다", async () => {
    const { router } = renderDocumentTree(documentPath(currentDocument.id));

    fireEvent.click(await findFolderRow(secondTopic));

    expect(getFolderRow(secondTopic)).toHaveAttribute("aria-expanded", "false");
    expect(getDocumentRowTitles()).toEqual([]);

    await act(() => router.navigate(documentPath(documentInThirdTopic.id)));
    await act(() => router.navigate(documentPath(currentDocument.id)));

    expect(getFolderRow(secondTopic)).toHaveAttribute("aria-expanded", "false");
  });

  it("다른 워크스페이스로 옮기면 앞 워크스페이스에서 누른 기록을 따르지 않는다", async () => {
    const { router } = renderDocumentTree(documentPath(currentDocument.id));

    // 지금 보는 문서의 폴더는 접고, 다른 폴더는 펼쳐 둬요
    fireEvent.click(await findFolderRow(secondTopic));
    fireEvent.click(getFolderRow(firstTopic));

    // mock은 워크스페이스와 무관하게 같은 문서를 줘서, 옮겨 간 워크스페이스에도 같은 이름의 폴더가 있어요
    await act(() =>
      router.navigate(
        getRouterPath({
          routeKey: "DOCUMENT",
          params: {
            workspaceId: OTHER_WORKSPACE_ID,
            documentId: String(currentDocument.id),
          },
        }),
      ),
    );

    expect(await findFolderRow(secondTopic)).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(getFolderRow(firstTopic)).toHaveAttribute("aria-expanded", "false");
  });

  it.each([
    ["목록에 없는 문서", "9999"],
    ["숫자가 아닌 문서 id", "abc"],
  ])("주소가 %s이면 어느 폴더도 펼치지 않는다", async (_, documentId) => {
    renderDocumentTree(documentPath(documentId));

    const folderRows = await findFolderRows();

    folderRows.forEach((folderRow) => {
      expect(folderRow).toHaveAttribute("aria-expanded", "false");
    });
    expect(getDocumentRowTitles()).toEqual([]);
  });

  it("불러오는 동안에는 머리말을 그대로 두고 불러오는 중이라고 알리고, 문서를 받으면 폴더로 바꾼다", async () => {
    mockServer.use(
      http.get(DOCUMENTS_REQUEST, async () => {
        await delay(50);

        return HttpResponse.json(documentsResponse);
      }),
    );

    renderDocumentTree();

    expect(
      within(getTree()).getByRole("status", { name: LOADING_LABEL }),
    ).toBeInTheDocument();

    await findFolderRow(firstTopic);

    expect(
      screen.queryByRole("status", { name: LOADING_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("문서가 하나도 없으면 머리말 아래에 아직 문서가 없다고 알린다", async () => {
    respondWith({ topics: [], items: [], nextCursor: null });

    renderDocumentTree();

    expect(await screen.findByText(EMPTY_NOTICE)).toBeInTheDocument();
    expect(within(getTree()).getByText(EMPTY_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["잘못된 요청(400)", () => new HttpResponse(null, { status: 400 })],
    ["서버 오류(500)", () => new HttpResponse(null, { status: 500 })],
    ["네트워크 오류", () => HttpResponse.error()],
  ])(
    "%s로 불러오지 못하면 머리말 아래에 안내와 「다시 시도」를 보여 준다",
    async (_, respond) => {
      mockServer.use(http.get(DOCUMENTS_REQUEST, respond));

      renderDocumentTree();

      // 사이드바는 좁아서 문구가 짧아요. 문구 전체가 같은지 봐요
      expect(
        within(await screen.findByRole("alert")).getByText(LOAD_FAILED_NOTICE),
      ).toBeInTheDocument();
      expect(
        within(getTree()).getByRole("button", { name: "다시 시도" }),
      ).toBeInTheDocument();
    },
  );

  it("「다시 시도」를 누르면 다시 불러와 폴더를 보여 준다", async () => {
    let requestCount = 0;
    mockServer.use(
      http.get(DOCUMENTS_REQUEST, () => {
        requestCount += 1;

        return requestCount === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(documentsResponse);
      }),
    );

    renderDocumentTree();
    await clickRetry();

    expect(await findFolderRow(firstTopic)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("목록을 보는 동안 다시 불러오기가 서버 오류로 실패하면 받은 목록을 계속 보여 준다", async () => {
    let failedRequestCount = 0;
    renderDocumentTree();
    await findFolderRow(firstTopic);

    mockServer.use(
      http.get(DOCUMENTS_REQUEST, () => {
        failedRequestCount += 1;

        return new HttpResponse(null, { status: 500 });
      }),
    );
    // 다른 탭에 다녀오면 목록을 다시 받아요
    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(failedRequestCount).toBe(1));

    expect(getFolderRow(firstTopic)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
      // 다른 화면으로 가면 문서 목록이 사라져, 간 뒤에는 안내가 있었는지 알 수 없어요. 가기 전까지 그려진 화면을 모두 지켜봐요
      let isAlertShown = false;
      const observer = new MutationObserver(() => {
        if (screen.queryByRole("alert") !== null) isAlertShown = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });

      renderDocumentTree();

      try {
        expect(await screen.findByText(destination)).toBeInTheDocument();
      } finally {
        observer.disconnect();
      }
      expect(isAlertShown).toBe(false);
    },
  );
});
