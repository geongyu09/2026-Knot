import {
  workspaceDetailResponse,
  workspacesResponse,
} from "@api/mock/responses/workspace";
import type { WorkspaceDetailResponse } from "@api/mock/types/workspace";
import { DialogProvider } from "@provider/context/dialogContext";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { useRecordingStore } from "@store/recordingStore";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { userEvent, within } from "storybook/test";

import WorkspaceSwitcher from ".";

const [currentWorkspace, otherWorkspace] = workspacesResponse.workspaces;
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: String(currentWorkspace.id) },
});

/** 녹음을 처음 상태로 되돌려요. 녹음은 전역 저장소에 남아 스토리끼리 이어지기 때문이에요. */
const resetRecording = () => {
  useRecordingStore.getState().discardRecording();
};

/** 12분 48초째 녹음 중인 상태로 만들어요. */
const startRecordingAt12m48s = () => {
  useRecordingStore.setState({
    status: "recording",
    accumulatedMs: 768_000,
    resumedAt: Date.now(),
  });
};

// 문서 페이지는 스토리를 한 화면에 함께 그리는데 msw는 화면에 하나뿐이라, 마지막 스토리의 응답이 모든 스토리에 적용돼요.
// 응답을 바꾸는 스토리만 따로 그려 각자의 응답을 받게 해요. 높이는 확인 창이 잘리지 않는 값이에요
const ISOLATED_DOCS = { story: { inline: false, iframeHeight: 480 } };

/** 워크스페이스 조회 응답의 내 역할과 멤버 수를 바꿔, 그에 맞는 나가기 창이 뜨게 해요. */
const respondWorkspace = (workspace: Partial<WorkspaceDetailResponse>) => ({
  workspace: http.get("*/api/v1/workspaces/:workspaceId", () =>
    HttpResponse.json({ ...workspaceDetailResponse, ...workspace }),
  ),
});

/** 워크스페이스 이름 버튼을 눌러 메뉴를 열어요. */
const openWorkspaceMenu = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  await userEvent.click(
    canvas.getByRole("button", { name: "워크스페이스 메뉴" }),
  );

  return within(
    await canvas.findByRole("region", { name: "워크스페이스 메뉴" }),
  );
};

/** 메뉴를 열고 「워크스페이스 나가기」를 눌러요. */
const clickLeaveWorkspace = async (canvasElement: HTMLElement) => {
  // 어떤 창을 띄울지는 워크스페이스 조회 결과로 정하므로 이름이 보일 때까지 기다려요
  await within(canvasElement).findByText(workspaceDetailResponse.name);
  const menu = await openWorkspaceMenu(canvasElement);

  await userEvent.click(
    menu.getByRole("button", { name: "워크스페이스 나가기" }),
  );
};

/**
 * 사이드바 맨 위에서 지금 워크스페이스의 이름을 보여 주는 버튼이에요. 누르면 워크스페이스 메뉴가 열려요.
 *
 * **동작 규칙**
 * - 이름을 받아 오기 전에는 이름 자리를 비워 둬요.
 * - 이름을 누르면 바로 아래로 메뉴가 펼쳐지고, 다시 누르거나 바깥을 누르거나 `Esc`를 누르면 닫혀요.
 * - 메뉴에는 내가 속한 워크스페이스 목록, 「새 워크스페이스 만들기」, 「워크스페이스 나가기」가 차례로 있어요. 지금 워크스페이스는 체크 없이 배경과 글자색으로만 구분해요.
 * - 다른 워크스페이스를 고르면 그 워크스페이스 홈으로, 「새 워크스페이스 만들기」를 고르면 워크스페이스 생성 화면으로 옮겨 가요. 지금 워크스페이스를 고르면 메뉴만 닫혀요.
 * - 「워크스페이스 나가기」를 고르면 내 처지에 맞는 확인 창이 떠요. 일반 멤버는 나갈지 묻는 창, 다른 멤버가 있는 owner는 owner를 넘길 멤버를 고르는 창, 혼자면 워크스페이스도 함께 삭제된다고 알리는 창이에요.
 * - owner를 넘길 멤버 목록을 불러오지 못하면 목록 자리에 「멤버 목록을 불러오지 못했어요. 다시 시도해 주세요.」와 「다시 시도」를 둬요. 「다시 시도」는 멤버 목록만 다시 받아요.
 * - 멤버를 고르는 창은 고르기 전에는 「넘기고 나가기」를 누를 수 없어요. 「워크스페이스 삭제하기」를 누르면 삭제 확인 창으로 바뀌고, 거기서 「취소」하면 고른 멤버가 남은 채로 돌아와요. 잘못 눌러 고른 멤버를 잃지 않도록, 고른 뒤에는 바깥을 눌러도 닫히지 않고 「취소」나 `Esc`로 닫아요.
 * - 어떤 창을 띄울지는 워크스페이스 조회로 받은 내 역할과 멤버 수로 정하고, owner를 넘길 멤버 목록은 창이 뜬 뒤에 받아 와요.
 * - 「나가기」나 「넘기고 나가기」를 누르면 창을 닫고 서버에 요청해요. 성공하면 이 탭에서 하던 녹음을 버리고, 남은 워크스페이스나 워크스페이스 선택 화면으로 옮겨 가요. 실패하면 화면과 녹음을 그대로 둬요.
 * - 워크스페이스 삭제는 아직 요청할 API가 없어, 「삭제」를 누르면 이 탭에서 하던 녹음만 버리고 창을 닫아요.
 * - 녹음은 워크스페이스를 가리지 않고 이어지므로, 녹음 중(일시정지 포함)에 다른 워크스페이스나 새로 만들기를 고르면 먼저 녹음을 끝낼지 물어요. 「끝내고 이동」은 녹음을 끝낸 뒤 옮겨 가고, 「취소」·바깥 클릭·`Esc`는 녹음과 화면을 그대로 둬요.
 */
const meta = {
  title: "Workspace/WorkspaceSwitcher",
  component: WorkspaceSwitcher,
  parameters: {
    layout: "padded",
    design: [
      {
        name: "Sidebar/Workspace",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=580-1442",
      },
      {
        name: "Menu/Workspace",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1814-16199",
      },
    ],
  },
  beforeEach: resetRecording,
  decorators: [
    (Story) => (
      <DialogProvider>
        <MemoryRouter initialEntries={[HOME_PATH]}>
          <Routes>
            <Route
              path={PATH_ROUTE.WORKSPACE_HOME}
              element={
                // 사이드바 안쪽 폭(280px에서 여백을 뺀 248px)과 메뉴가 펼쳐질 높이만큼 자리를 줘요
                <div style={{ width: "15.5rem", height: "20rem" }}>
                  <Story />
                </div>
              }
            />
          </Routes>
        </MemoryRouter>
      </DialogProvider>
    ),
  ],
} satisfies Meta<typeof WorkspaceSwitcher>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 메뉴를 열기 전 모습이에요. 사이드바를 열면 맨 위에 보여요. */
export const Default: Story = {};

/** 이름을 눌러 메뉴를 연 상태예요. 다른 워크스페이스로 옮겨 가거나 새로 만들 때 써요. */
export const MenuOpen: Story = {
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2017-35340",
    },
  },
  play: async ({ canvasElement }) => {
    const menu = await openWorkspaceMenu(canvasElement);

    await menu.findByRole("button", { name: otherWorkspace.name });
  },
};

/** 녹음 중에 다른 워크스페이스를 골랐을 때예요. 옮겨 가기 전에 녹음을 끝낼지 물어요. */
export const EndRecordingBeforeMove: Story = {
  beforeEach: () => {
    startRecordingAt12m48s();

    return resetRecording;
  },
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2017-35354",
    },
  },
  play: async ({ canvasElement }) => {
    const menu = await openWorkspaceMenu(canvasElement);

    await userEvent.click(
      await menu.findByRole("button", { name: otherWorkspace.name }),
    );
  },
};

/** 일반 멤버가 「워크스페이스 나가기」를 골랐을 때예요. 나갈지 한 번 더 물어요. */
export const LeaveAsMember: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: { handlers: respondWorkspace({ myRole: "MEMBER" }) },
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2167-24781",
    },
  },
  play: async ({ canvasElement }) => {
    await clickLeaveWorkspace(canvasElement);
  },
};

/** 다른 멤버가 있는 owner가 「워크스페이스 나가기」를 골랐을 때예요. owner를 넘길 멤버를 골라야 나갈 수 있어요. */
export const LeaveAsOwner: Story = {
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2979-13959",
    },
  },
  play: async ({ canvasElement }) => {
    await clickLeaveWorkspace(canvasElement);
  },
};

/**
 * owner가 「워크스페이스 나가기」를 골랐는데 넘길 멤버 목록을 불러오지 못했을 때예요. 서버 오류와 네트워크 문제가 모두 이 모습이에요.
 * 창은 그대로 두고 목록 자리에 안내와 「다시 시도」를 보여 줘요. 이 스토리에서는 「다시 시도」를 눌러도 계속 실패해요.
 */
export const LeaveAsOwnerCandidatesLoadFailed: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: {
      handlers: {
        ownershipTransferCandidates: http.get(
          "*/api/v1/workspaces/:workspaceId/ownership-transfer-candidates",
          () => new HttpResponse(null, { status: 500 }),
        ),
      },
    },
  },
  play: async ({ canvasElement }) => {
    await clickLeaveWorkspace(canvasElement);
  },
};

/** owner가 멤버를 고르는 창에서 「워크스페이스 삭제하기」를 눌렀을 때예요. 「취소」하면 멤버를 고르는 창으로 돌아가요. */
export const DeleteWorkspace: Story = {
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2979-13987",
    },
  },
  play: async ({ canvasElement }) => {
    await clickLeaveWorkspace(canvasElement);

    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "워크스페이스 삭제하기",
      }),
    );
  },
};

/** 워크스페이스에 나 혼자 남았을 때예요. 나가면 워크스페이스도 함께 삭제된다고 알려요. */
export const LeaveAlone: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: { handlers: respondWorkspace({ activeMemberCount: 1 }) },
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2979-14001",
    },
  },
  play: async ({ canvasElement }) => {
    await clickLeaveWorkspace(canvasElement);
  },
};
