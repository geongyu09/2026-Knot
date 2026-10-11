import { documentsResponse } from "@api/mock/responses/document";
import { resetDocumentMockState } from "@api/mock/state/document";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";

import WorkspaceSidebar from ".";

const WORKSPACE_ID = 1;
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: String(WORKSPACE_ID) },
});
// 기본 응답의 첫 문서(가장 최근 문서)를 지금 보는 문서로 열어요
const [openedDocument] = documentsResponse.items;
const DOCUMENT_PATH = getRouterPath({
  routeKey: "DOCUMENT",
  params: {
    workspaceId: String(WORKSPACE_ID),
    documentId: String(openedDocument.id),
  },
});

/**
 * 워크스페이스 화면 왼쪽의 사이드바 드로어예요. 워크스페이스 이름과 문서 목록을 보여 줘요.
 *
 * **동작 규칙**
 * - 상단 메뉴 왼쪽의 사이드바 버튼으로 여닫아요. 버튼에 마우스를 올리면 본문 위에 겹쳐 뜨고, 누르면 왼쪽에 자리를 잡아요. 뜨는 방식과 자리는 감싸는 패널이 정하고, 이 드로어는 껍데기와 내용만 그려요.
 * - 위쪽에는 지금 보고 있는 워크스페이스의 이름이 나와요. 이름을 받아 오기 전에는 이름 자리를 비워 둬요.
 * - 「문서」 아래에는 워크스페이스의 문서가 폴더별로 나와요. 폴더를 누르면 펼치고, 문서를 누르면 그 문서 보기로 가요.
 *   지금 보는 문서의 폴더만 펼친 채로 시작해요.
 */
const meta = {
  title: "Workspace/WorkspaceSidebar",
  component: WorkspaceSidebar,
  parameters: {
    layout: "padded",
    initialPath: HOME_PATH,
    design: [
      {
        name: "Sidebar/Drawer",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1382-2171",
      },
      {
        name: "Sidebar/Workspace",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=580-1442",
      },
      {
        name: "문서/사이드바·원문 열림 (Sidebar/Docs)",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2017-36145",
      },
    ],
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
              // 레이아웃처럼 화면이 바뀌어도 사이드바가 남도록, 화면들을 감싸는 자리에 둬요
              <>
                {/* 드로어는 감싸는 패널의 높이를 그대로 채우므로 화면 높이만큼 자리를 줘요 */}
                <div style={{ height: "40rem" }}>
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
} satisfies Meta<typeof WorkspaceSidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 홈에서 사이드바를 연 모습이에요. 워크스페이스 이름과 「문서」 아래의 폴더들이 보이고, 문서 보기가 아닌 화면이라 모든 폴더가 접혀 있어요. */
export const Default: Story = {};

/** 문서 보기 화면에서 사이드바를 연 모습이에요. 지금 보는 「스프린트 회고」가 든 「주간 회의」 폴더가 펼쳐져 있고, 그 문서 행이 배경으로 표시돼요. */
export const DocumentOpened: Story = {
  parameters: { initialPath: DOCUMENT_PATH },
};
