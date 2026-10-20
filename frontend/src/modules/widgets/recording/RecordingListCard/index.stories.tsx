import { CURRENT_RECORDING_API_PATH } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/current";
import { currentRecordingResponse } from "@api/mock/responses/recording";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { useRecordingStore } from "@store/recordingStore";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";

import RecordingListCard from ".";

const WORKSPACE_ID = 1;
const HOME_PATH = getRouterPath({
  routeKey: "WORKSPACE_HOME",
  params: { workspaceId: String(WORKSPACE_ID) },
});
const CURRENT_URL = `*${CURRENT_RECORDING_API_PATH(WORKSPACE_ID)}`;

// 응답이나 이 탭의 녹음을 바꾸는 스토리는 문서 페이지에서 따로 그려야 다른 스토리와 섞이지 않아요
const ISOLATED_DOCS = { story: { inline: false, iframeHeight: 280 } };

/** 이 탭의 녹음을 처음 상태로 되돌려요. 녹음은 전역 저장소에 있어 스토리끼리 이어지기 때문이에요. */
const resetRecording = () => {
  useRecordingStore.getState().discardRecording();
};

/**
 * 워크스페이스 홈의 「진행 중인 녹음」 카드예요. 내 최신 녹음의 녹음·문서 생성 진행 상태 하나만 보여 줘요.
 *
 * **동작 규칙**
 * - 다른 사람의 녹음은 보이지 않고, 개수도 표시하지 않아요. 함께 녹음·여러 녹음은 이후 버전이에요.
 * - 녹음이 있으면 한 칸에 상태(점 + 상태 · 녹음한 시간), 녹음 이름(「{내 닉네임} 님의 녹음」), 안내 한 줄을 보여 줘요.
 * - 녹음 중이면 빨간 점·빨간 글자에 시간이 1초마다 늘어나고, 일시정지면 회색 점·회색 글자에 시간이 멈춰요.
 * - 이 탭에서 시작한 녹음이면 이 탭의 상태와 시간을 보여 주고 「녹음 화면으로」 버튼으로 녹음 화면에 가요.
 * - 다른 탭에서 시작한 녹음이면 서버가 알려 준 상태와 시간을 보여 주고 버튼은 숨겨요. 녹음 화면은 녹음을 시작한 탭에서만 열 수 있기 때문이에요.
 * - 녹음이 없으면 빈 상태 문구로 독의 마이크에서 녹음을 시작하도록 안내해요.
 * - 녹음 상태를 불러오지 못하면 칸 자리에 실패 안내와 「다시 시도」를 둬요. 「다시 시도」는 이 카드의 녹음만 다시 불러와요. 표시만 실패한 것이라 녹음은 멈추지 않고, 이 탭에서 시작한 녹음은 그대로 보여요.
 * - 녹음이나 내 닉네임을 불러오는 동안에는 칸 자리를 뼈대로 채워 카드 높이가 흔들리지 않게 해요. 카드 제목은 그대로 보여요.
 * - 홈에 들어올 때와 다른 창에서 돌아올 때 녹음을 다시 불러와요. 진행 상태가 있으면 5초마다 갱신해요.
 * - 문서 생성 중이면 녹음 시간은 멈추고 「보기」 버튼으로 해당 녹음의 문서 정리 화면에 가요. 완료·실패·내용 없음·폐기는 빈 상태로 돌아가요.
 */
const meta = {
  title: "Recording/RecordingListCard",
  component: RecordingListCard,
  parameters: {
    layout: "centered",
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1783-13368",
    },
  },
  beforeEach: resetRecording,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={[HOME_PATH]}>
        <Routes>
          <Route path={PATH_ROUTE.WORKSPACE_HOME} element={<Story />} />
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof RecordingListCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 다른 탭에서 시작한 녹음이 이어지고 있을 때예요. 예: 녹음을 켜 둔 채 새 탭으로 홈을 연 경우 */
export const Default: Story = {};

/** 이 탭에서 시작한 녹음이 이어지고 있을 때예요. 예: 독의 마이크로 녹음을 시작하고 홈으로 돌아온 경우 */
export const RecordingInThisTab: Story = {
  beforeEach: () => {
    useRecordingStore.setState({
      status: "recording",
      session: {
        workspaceId: WORKSPACE_ID,
        recordingId: currentRecordingResponse.recordingId,
        audioMode: "FINAL_WEBM_V1",
      },
      accumulatedMs: (12 * 60 + 48) * 1000,
      resumedAt: Date.now(),
    });
  },
  parameters: {
    // 녹음은 전역 저장소에 있어, 문서 페이지에서 함께 그리면 다른 스토리도 이 탭의 녹음으로 보여요
    docs: ISOLATED_DOCS,
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1783-13269",
    },
  },
};

/** 녹음을 잠시 멈췄을 때예요. 예: 회의 중 쉬는 시간에 일시정지하고 다른 탭으로 홈을 본 경우 */
export const Paused: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: {
      handlers: {
        currentRecording: http.get(CURRENT_URL, () =>
          HttpResponse.json({ ...currentRecordingResponse, status: "PAUSED" }),
        ),
      },
    },
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2377-35853",
    },
  },
};

/** 녹음을 끝내고 오디오 준비·전사·문서 생성을 기다릴 때예요. 「보기」로 문서 정리 화면에 갈 수 있어요. */
export const Processing: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: {
      handlers: {
        currentRecording: http.get(CURRENT_URL, () =>
          HttpResponse.json({
            ...currentRecordingResponse,
            status: "PROCESSING",
          }),
        ),
      },
    },
  },
};

/** 진행 중인 녹음이 없을 때예요. 홈에 처음 들어왔거나 녹음을 끝낸 뒤의 모습이에요. */
export const Empty: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: {
      handlers: {
        currentRecording: http.get(
          CURRENT_URL,
          () => new HttpResponse(null, { status: 204 }),
        ),
      },
    },
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1783-13367",
    },
  },
};

/** 녹음을 불러오는 중이에요. 홈에 들어오자마자 잠깐 보여요. */
export const Loading: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: {
      handlers: {
        currentRecording: http.get(CURRENT_URL, async () => {
          await delay("infinite");
          return new HttpResponse(null, { status: 204 });
        }),
      },
    },
  },
};

/** 녹음 상태를 불러오지 못했을 때예요. 예: 홈에 들어왔는데 서버가 잠시 답하지 못한 경우 */
export const LoadFailed: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: {
      handlers: {
        currentRecording: http.get(
          CURRENT_URL,
          () => new HttpResponse(null, { status: 500 }),
        ),
      },
    },
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3892-15440",
    },
  },
};
