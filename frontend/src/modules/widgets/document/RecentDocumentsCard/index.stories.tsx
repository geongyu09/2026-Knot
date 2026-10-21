import { DOCUMENTS_API_PATH } from "@api/fetch/api/v1/workspaces/[workspaceId]/documents";
import { documentsResponse } from "@api/mock/responses/document";
import { resetDocumentMockState } from "@api/mock/state/document";
import type { DocumentsResponse } from "@api/mock/types/document";
import { ToastProvider } from "@provider/context/toastContext";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";

import RecentDocumentsCard from ".";

const WORKSPACE_ID = 1;
const DOCUMENTS_REQUEST = `*${DOCUMENTS_API_PATH(WORKSPACE_ID)}`;
const [onlyDocument] = documentsResponse.items;
const SINGLE_DOCUMENT_RESPONSE = {
  ...documentsResponse,
  items: [onlyDocument],
} satisfies DocumentsResponse;
const EMPTY_DOCUMENTS_RESPONSE = {
  topics: [],
  items: [],
  nextCursor: null,
} satisfies DocumentsResponse;

// 문서 페이지에서는 스토리를 한 화면에 함께 그려 응답이 섞이므로, 응답을 덮는 스토리는 따로 그려요
const ISOLATED_DOCS = { story: { inline: false, iframeHeight: 360 } };

/**
 * 워크스페이스 홈의 「최근 추가된 문서」 카드예요. 홈의 오른쪽 위에 놓여요.
 *
 * **동작 규칙**
 * - 워크스페이스에서 가장 최근에 만들어진 문서를 3개까지 서버가 준 순서(최신순)로 보여 줘요. 행에는 제목 · 만든 날짜 · 녹음 길이가 있어요.
 * - 행을 누르면 그 문서의 문서 보기 화면으로 가요. 카드 머리의 「전체 보기」를 누르면 문서 목록 화면으로 가요.
 * - 카드 크기는 400x312로 고정이에요. 문서가 3개보다 적어도 카드가 줄어들지 않고 행만 적게 보여요.
 * - 문서를 받지 못한 동안에는 카드 전체를 아래 세 화면 중 하나로 그려요.
 *   - 불러오는 중: 제목과 「전체 보기」는 그대로 두고, 행 자리를 회색 덩어리 3줄로 채워요. 회색 덩어리는 실제 행과 간격 · 높이가 같아서, 불러온 뒤 내용이 움직이지 않아요.
 *   - 문서 없음: 제목만 두고 「아직 문서가 없어요」를 보여 줘요. 문서 목록에도 볼 것이 없어 「전체 보기」는 두지 않아요.
 *   - 불러오지 못함: 제목과 「전체 보기」는 그대로 두고 「목록을 불러오지 못했어요. 다시 시도해 주세요.」와 「다시 시도」를 보여 줘요.
 *     「다시 시도」를 누르면 화면을 새로고침하지 않고 이 카드의 문서만 다시 받아요. 새로고침하면 진행 중인 녹음이 사라지기 때문이에요.
 * - 문서를 한 번 받은 뒤에는 다시 불러오기가 실패해도 받은 문서를 계속 보여 줘요. 예: 다른 탭에 다녀와 문서를 다시 받다가 서버 오류가 난 경우
 * - 로그인이 풀렸으면(401) 로그인 화면으로, 워크스페이스 멤버가 아니거나(403) 없는 워크스페이스면(404) 마지막으로 본 다른 워크스페이스 홈이나 워크스페이스 선택 화면으로 보내고 오류 토스트로 알려요.
 *   보내는 동안에는 불러오지 못했다는 안내 없이 불러오는 중 모습이에요.
 */
const meta = {
  title: "Document/RecentDocumentsCard",
  component: RecentDocumentsCard,
  parameters: {
    layout: "centered",
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1562-2616",
    },
  },
  // 다른 스토리에서 누른 문서 확인 기록이 목록 응답에 남지 않게, 스토리를 열 때마다 mock 상태를 처음으로 되돌려요
  loaders: [
    () => {
      resetDocumentMockState();
    },
  ],
  decorators: [
    (Story) => (
      <MemoryRouter
        initialEntries={[
          getRouterPath({
            routeKey: "WORKSPACE_HOME",
            params: { workspaceId: String(WORKSPACE_ID) },
          }),
        ]}
      >
        <ToastProvider>
          <Routes>
            <Route path={PATH_ROUTE.WORKSPACE_HOME} element={<Story />} />
            <Route
              path={PATH_ROUTE.DOCUMENT}
              element={<p>문서 보기 화면으로 이동했어요.</p>}
            />
            <Route
              path={PATH_ROUTE.DOCUMENTS}
              element={<p>문서 목록 화면으로 이동했어요.</p>}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof RecentDocumentsCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 문서를 불러온 기본 모습이에요. 가장 최근 문서 세 개(스프린트 회고 · 온보딩 인터뷰 정리 · 홈 개편 논의)가 최신순으로 있어요.
 * 행을 누르면 그 문서의 문서 보기로, 「전체 보기」를 누르면 문서 목록으로 가요.
 */
export const Default: Story = {};

/**
 * 워크스페이스에 문서가 하나뿐일 때예요. 예: 첫 녹음을 끝내고 문서가 하나만 생긴 워크스페이스.
 * 카드 높이는 그대로이고 행만 하나예요.
 */
export const SingleDocument: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: {
      handlers: {
        documents: http.get(DOCUMENTS_REQUEST, () =>
          HttpResponse.json(SINGLE_DOCUMENT_RESPONSE),
        ),
      },
    },
  },
};

/**
 * 최근 문서를 불러오는 동안이에요. 제목과 「전체 보기」는 그대로 두고, 행 자리를 회색 덩어리 3줄로 채워요.
 * 요청 제한 시간(10초)이 지나면 불러오기 실패 모습으로 바뀌어요.
 */
export const Loading: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3805-38611",
    },
    msw: {
      handlers: {
        documents: http.get(DOCUMENTS_REQUEST, async () => {
          await delay("infinite");
          return HttpResponse.json(documentsResponse);
        }),
      },
    },
  },
};

/**
 * 워크스페이스에 문서가 하나도 없을 때예요. 예: 아직 한 번도 녹음하지 않은 워크스페이스.
 * 제목 아래에 「아직 문서가 없어요」와 「녹음을 끝내면 정리된 문서가 여기에 쌓여요」를 보여 줘요. 문서 목록에도 볼 것이 없어 「전체 보기」는 없어요.
 */
export const NoDocuments: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1917-18135",
    },
    msw: {
      handlers: {
        documents: http.get(DOCUMENTS_REQUEST, () =>
          HttpResponse.json(EMPTY_DOCUMENTS_RESPONSE),
        ),
      },
    },
  },
};

/**
 * 최근 문서를 불러오지 못했을 때예요. 서버 오류, 네트워크 문제, 잘못된 주소(400)가 모두 이 모습이에요.
 * 제목과 「전체 보기」는 그대로 두고 행 자리에 안내와 「다시 시도」를 보여 줘요. 이 스토리에서는 「다시 시도」를 눌러도 계속 실패해요.
 */
export const LoadFailed: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3892-15512",
    },
    msw: {
      handlers: {
        documents: http.get(
          DOCUMENTS_REQUEST,
          () => new HttpResponse(null, { status: 500 }),
        ),
      },
    },
  },
};
