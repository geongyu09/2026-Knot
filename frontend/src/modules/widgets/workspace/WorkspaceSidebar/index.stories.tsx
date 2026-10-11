import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { MemoryRouter, Route, Routes } from "react-router";

import WorkspaceSidebar from ".";

const WORKSPACE_ID = 1;
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: String(WORKSPACE_ID) },
});

/**
 * 워크스페이스 화면 왼쪽의 사이드바 드로어예요. 워크스페이스 이름과 문서 목록을 보여 줘요.
 *
 * **동작 규칙**
 * - 상단 메뉴 왼쪽의 사이드바 버튼으로 여닫아요. 버튼에 마우스를 올리면 본문 위에 겹쳐 뜨고, 누르면 왼쪽에 자리를 잡아요. 뜨는 방식과 자리는 감싸는 패널이 정하고, 이 드로어는 껍데기와 내용만 그려요.
 * - 위쪽에는 지금 보고 있는 워크스페이스의 이름이 나와요. 이름을 받아 오기 전에는 이름 자리를 비워 둬요.
 * - 「문서」 아래에는 워크스페이스의 문서가 폴더별로 나와요. 폴더를 누르면 펼치고, 문서를 누르면 그 문서 보기로 가요. 자세한 규칙은 `DocumentTree` 스토리에 있어요.
 */
const meta = {
  title: "Workspace/WorkspaceSidebar",
  component: WorkspaceSidebar,
  parameters: {
    layout: "padded",
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
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={[HOME_PATH]}>
        <Routes>
          <Route
            path={PATH_ROUTE.WORKSPACE_HOME}
            element={
              // 드로어는 감싸는 패널의 높이를 그대로 채우므로 화면 높이만큼 자리를 줘요
              <div style={{ height: "40rem" }}>
                <Story />
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof WorkspaceSidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 사이드바를 처음 열었을 때예요. 문서 보기가 아닌 화면이라 모든 폴더가 접혀 있어요. */
export const Default: Story = {};
