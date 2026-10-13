import { DOCUMENTS_API_PATH } from "@api/fetch/api/v1/workspaces/[workspaceId]/documents";
import { documentsResponse } from "@api/mock/responses/document";
import { resetDocumentMockState } from "@api/mock/state/document";
import type { DocumentsResponse } from "@api/mock/types/document";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";

import PendingDocumentsCard from ".";

const WORKSPACE_ID = 1;
const DOCUMENTS_REQUEST = `*${DOCUMENTS_API_PATH(WORKSPACE_ID)}`;
// 기본 응답의 문서 전체(7개)를 내가 아직 확인하지 않은 문서로 바꾼 응답
const MANY_DOCUMENTS_RESPONSE = {
  ...documentsResponse,
  items: documentsResponse.items.map((item) => ({
    ...item,
    myConfirmationState: "PENDING" as const,
  })),
} satisfies DocumentsResponse;
const EMPTY_DOCUMENTS_RESPONSE = {
  topics: [],
  items: [],
  nextCursor: null,
} satisfies DocumentsResponse;
// 문서 페이지에서는 스토리를 한 화면에 함께 그려 응답이 섞이므로, 응답을 덮는 스토리는 따로 그려요
const ISOLATED_DOCS = { story: { inline: false, iframeHeight: 360 } };

/**
 * 워크스페이스에서 내가 아직 확인하지 않은 문서를 모아 보여 주는 「확인이 필요한 문서」 카드예요.
 * 홈의 왼쪽 위에 놓여요.
 *
 * **동작 규칙**
 * - 녹음에 참여했는지와 상관없이, 내가 확인할 대상이고 아직 확인하지 않은 문서를 모두 보여 줘요. 순서는 서버가 준 순서(최근에 만든 문서가 위)예요.
 * - 제목 옆의 숫자는 서버가 센 확인할 문서 수예요.
 * - 행에는 문서 제목과 만든 날짜, 「확인하기」가 있어요. 제목이 길면 한 줄에서 말줄임해요. 확인한 사람 수는 보여 주지 않아요.
 * - 「확인하기」를 누르면 그 문서의 문서 보기 화면으로 가요. 카드에서 바로 확인되지는 않아요.
 *   확인은 취소할 수 없어서, 문서를 읽은 뒤 문서 보기의 「문서를 확인했어요」로 확인하게 했어요.
 * - 카드의 높이는 문서 수와 상관없이 같아요. 행은 3개까지 한 번에 보이고, 더 많으면 제목 줄은 그 자리에 둔 채 행만 카드 안에서 스크롤해요.
 * - 불러오는 중이거나 확인할 문서가 없을 때도 제목과 카드의 높이는 그대로 두고, 문서 수를 숨긴 채 행 자리만 바꿔요.
 *   불러오는 중의 회색 덩어리는 실제 행과 간격 · 높이가 같아서, 불러온 뒤 내용이 움직이지 않아요.
 */
const meta = {
  title: "Document/PendingDocumentsCard",
  component: PendingDocumentsCard,
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1783-13415",
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
        <Routes>
          <Route path={PATH_ROUTE.WORKSPACE_HOME} element={<Story />} />
          <Route
            path={PATH_ROUTE.DOCUMENT}
            element={<p>문서 보기 화면으로 이동했어요.</p>}
          />
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof PendingDocumentsCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 확인할 문서를 불러온 기본 모습이에요. 내가 아직 확인하지 않은 문서 2개(스프린트 회고 · 회원 탈퇴 정책)가 있어요.
 * 「확인하기」를 누르면 그 문서의 문서 보기로 가요.
 */
export const Default: Story = {};

/**
 * 확인할 문서가 한 번에 보이는 3개보다 많을 때예요. 예: 한동안 문서를 확인하지 않은 멤버의 홈.
 * 문서 7개가 모두 있고, 카드의 높이는 그대로인 채 행만 카드 안에서 스크롤해요. 시안에는 없는 모습이에요.
 */
export const ManyDocuments: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    msw: {
      handlers: {
        documents: http.get(DOCUMENTS_REQUEST, () =>
          HttpResponse.json(MANY_DOCUMENTS_RESPONSE),
        ),
      },
    },
  },
};

/**
 * 확인할 문서를 불러오는 동안이에요. 제목은 그대로 두고 문서 수를 숨긴 채, 행 자리를 행 2개 모양의 회색 덩어리로 채워요.
 * 요청 제한 시간(10초)이 지나면 불러오지 못한 모습으로 바뀌어요.
 */
export const Loading: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3805-38616",
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
 * 확인할 문서가 없을 때예요. 예: 아직 한 번도 녹음하지 않은 워크스페이스, 문서를 모두 확인한 멤버의 홈.
 * 카드를 숨기지 않고, 문서 수를 숨긴 채 행 자리에 「아직 문서가 없어요」를 보여 줘요.
 */
export const NoDocuments: Story = {
  parameters: {
    docs: ISOLATED_DOCS,
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1973-20009",
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
