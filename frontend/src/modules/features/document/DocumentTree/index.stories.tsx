import { DOCUMENTS_API_PATH } from "@api/fetch/api/v1/workspaces/[workspaceId]/documents";
import { documentsResponse } from "@api/mock/responses/document";
import { resetDocumentMockState } from "@api/mock/state/document";
import type { DocumentsResponse } from "@api/mock/types/document";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";

import DocumentTree from ".";

const WORKSPACE_ID = 1;
const DOCUMENTS_REQUEST = `*${DOCUMENTS_API_PATH(WORKSPACE_ID)}`;
const EMPTY_DOCUMENTS_RESPONSE = {
  topics: [],
  items: [],
  nextCursor: null,
} satisfies DocumentsResponse;
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: String(WORKSPACE_ID) },
});
// 기본 응답의 첫 문서(가장 최근 문서)를 지금 보는 문서로 열어요
const [currentDocument] = documentsResponse.items;
const CURRENT_DOCUMENT_PATH = getRouterPath({
  routeKey: "DOCUMENT",
  params: {
    workspaceId: String(WORKSPACE_ID),
    documentId: String(currentDocument.id),
  },
});

/**
 * 사이드바의 「문서」 아래에 놓이는 문서 목록이에요. 워크스페이스의 문서를 폴더(주제)별로 접어 보여 줘요.
 *
 * **동작 규칙**
 * - 폴더는 이름순, 폴더 안의 문서는 최근 회의순이에요. 최근에 시작한 녹음에서 나온 문서가 위에 와요. 폴더 이름 옆의 숫자는 서버가 준 그 폴더의 문서 수예요.
 *   문서 목록 화면과 같은 조회를 써서, 두 곳의 순서와 문서 수가 같아요.
 * - 지금 보는 문서의 폴더만 펼친 채로 시작해요. 문서 보기가 아닌 화면에서는 모든 폴더가 접혀 있어요.
 * - 사용자가 누른 폴더는 누른 대로 둬요. 누른 적 없는 폴더는 다른 문서로 옮기면 지금 보는 문서를 따라 펼치고 접어요.
 *   누른 기록은 목록이 화면에 있는 동안만 남아서, 사이드바를 닫으면 사라져요.
 * - 문서 행을 누르면 그 문서 보기로 가요. 지금 보는 문서 행은 배경으로 표시해요.
 * - 문서를 받지 못한 동안에는 머리말 「문서」는 그대로 두고, 그 아래를 세 화면 중 하나로 바꿔요.
 *   불러오는 중에는 회색 덩어리를, 문서가 하나도 없으면 「아직 문서가 없어요」를, 불러오지 못하면 안내와 `다시 시도`를 보여 줘요.
 *   `다시 시도`를 누르면 화면을 새로고침하지 않고 문서 목록만 다시 받아요. 새로고침하면 진행 중인 녹음이 사라지기 때문이에요.
 * - 문서를 한 번 받은 뒤에는 다시 불러오기가 실패해도 받은 목록을 계속 보여 줘요. 예: 다른 탭에 다녀와 목록을 다시 받을 때 서버 오류가 난 경우
 * - 로그인이 풀렸으면(401) 로그인 화면으로, 워크스페이스 멤버가 아니거나(403) 없는 워크스페이스면(404) 워크스페이스 선택 화면으로 보내요.
 */
const meta = {
  title: "Document/DocumentTree",
  component: DocumentTree,
  parameters: {
    initialPath: HOME_PATH,
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2017-36145",
    },
  },
  // 다른 스토리에서 누른 문서 확인 기록이 목록 응답에 남지 않게, 스토리를 열 때마다 mock 상태를 처음으로 되돌려요
  loaders: [
    () => {
      resetDocumentMockState();
    },
  ],
  decorators: [
    (Story, { parameters }) => (
      <MemoryRouter initialEntries={[parameters.initialPath]}>
        <Routes>
          <Route
            element={
              // 사이드바처럼 화면이 바뀌어도 문서 목록이 남도록, 화면들을 감싸는 자리에 둬요
              <>
                {/* 사이드바의 안쪽 폭(280px - 좌우 여백 32px)이에요. 사이드바처럼 세로로 쌓아, 남은 높이를 채우는 화면이 `treeHeight`를 받게 해요 */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "15.5rem",
                    height: parameters.treeHeight,
                  }}
                >
                  <Story />
                </div>
                <Outlet />
              </>
            }
          >
            <Route path={PATH_ROUTE.WORKSPACE_HOME} />
            <Route
              path={PATH_ROUTE.DOCUMENT}
              element={<p>문서 보기 화면이에요.</p>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof DocumentTree>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 문서 보기가 아닌 화면에서 본 모습이에요. 예: 워크스페이스 홈.
 * 폴더 3개(사용자 인터뷰 · 주간 회의 · 회원 관리)가 모두 접혀 있어요. 폴더를 누르면 펼치고, 문서 행을 누르면 그 문서 보기로 가요.
 */
export const Default: Story = {};

/**
 * 문서 보기 화면에서 본 모습이에요. 지금 보는 「스프린트 회고」가 든 「주간 회의」 폴더만 펼쳐져 있고, 그 문서 행이 배경으로 표시돼요.
 */
export const CurrentDocument: Story = {
  parameters: { initialPath: CURRENT_DOCUMENT_PATH },
};

/**
 * 문서 목록을 불러오는 동안이에요. 머리말 「문서」는 그대로 두고, 폴더 이름과 문서 제목 자리를 회색 막대로 채워요.
 * 폴더 네 개에 문서 행을 두 개 · 한 개 · 한 개 · 없음으로 둬요. 화살표 · 문서 수 · 세로선은 그리지 않아요.
 * 행의 높이 · 간격이 실제 목록과 같아서, 불러온 뒤 내용이 움직이지 않아요. 요청 제한 시간(10초)이 지나면 불러오기 실패 모습으로 바뀌어요.
 */
export const Loading: Story = {
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3989-41916",
    },
    // 문서 페이지에서는 스토리를 한 화면에 함께 그려 응답이 섞이므로, 응답을 덮는 스토리는 따로 그려요
    docs: { story: { inline: false, iframeHeight: 360 } },
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
 * 머리말 「문서」 아래 남은 자리의 가운데에 「아직 문서가 없어요」를 보여 줘요.
 * 사이드바에서는 머리말 아래 남은 높이 전체가 그 자리예요. 이 스토리는 문서 목록의 높이를 320px로 두고 보여 줘요.
 */
export const NoDocuments: Story = {
  parameters: {
    treeHeight: "20rem",
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3989-42033",
    },
    docs: { story: { inline: false, iframeHeight: 360 } },
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
 * 문서 목록을 불러오지 못했을 때예요. 서버 오류, 네트워크 문제, 잘못된 주소(400)가 모두 이 모습이에요.
 * 머리말 아래 남은 영역의 가운데에 작은 안내 「목록을 불러오지 못했어요」와 「다시 시도」를 보여 줘요.
 * 이 스토리에서는 「다시 시도」를 눌러도 계속 실패해요.
 */
export const LoadFailed: Story = {
  parameters: {
    treeHeight: "20rem",
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3989-42119",
    },
    docs: { story: { inline: false, iframeHeight: 360 } },
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
