import { searchConversationsResponse } from "@api/mock/responses/search";
import { PATH_ROUTE, getRouterPath } from "@routes/PATH_ROUTE";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";

import SearchConversationList from ".";

const WORKSPACE_ID = "1";
const CONVERSATION_PATH = getRouterPath({
  routeKey: "CHAT_SESSION",
  params: {
    workspaceId: WORKSPACE_ID,
    sessionId: String(searchConversationsResponse.items[0].id),
  },
});
const CONVERSATIONS_URL =
  "*/api/v1/workspaces/:workspaceId/search/conversations";

const DAY = 24 * 60 * 60 * 1000;
const fromNow = (elapsed: number) =>
  new Date(Date.now() - elapsed).toISOString();

/**
 * 워크스페이스에 쌓인 내 탐색 대화 목록이에요. 탐색 화면의 대화 목록 드로어(`Chat/ChatListDrawer`) 안에 놓여요.
 *
 * **동작 규칙**
 * - 대화를 마지막으로 메시지가 오간 시각(`updatedAt`)으로 「오늘 / 이번 주 / 지난 30일 / 이전」에 묶어요. 오늘은 날짜가 같은지로, 나머지는 지금으로부터 지난 시간으로 가르고, 대화가 없는 묶음은 감춰요.
 * - 같은 묶음 안에서는 마지막으로 메시지가 오간 대화가 위로 와요. 빈 대화와 첫 답변이 실패한 대화는 서버가 목록에서 빼요.
 * - 한 줄에는 대화 제목과 마지막으로 오간 시각을 보여 주고, 제목이 길면 한 줄에서 말줄임표로 잘라요.
 * - 지금 보고 있는 대화(주소의 대화 ID)는 채워진 모양으로 표시하고, 화면 낭독기에도 지금 보고 있는 대화라고 알려요. 다른 대화를 누르면 그 대화 화면으로 옮겨 가요.
 * - 대화가 하나도 없으면 목록 자리에 빈 안내를 띄워요. 대화가 없는 게 오류가 아니라는 것과, 새 대화를 시작하면 목록이 채워진다는 것을 알려 줘요. 목록을 받아 오는 중에도 같은 안내가 보여요.
 * - 목록을 받아 오지 못하면 빈 안내 대신 그 자리 가운데에 작은 실패 안내 「대화 목록을 불러오지 못했어요」와 「다시 시도」를 띄워요. 「다시 시도」는 대화 목록만 다시 받아요. 로그인이 풀렸으면(401) 안내 없이 로그인 화면으로 보내요.
 * - 목록을 한 번 받은 뒤에는 다시 불러오기가 실패해도 받은 목록을 계속 보여 줘요.
 */
const meta = {
  title: "Search/SearchConversationList",
  component: SearchConversationList,
  parameters: {
    layout: "padded",
    design: [
      {
        name: "대화 목록",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=580-1961",
      },
      {
        name: "기간 묶음",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=580-1533",
      },
      {
        name: "SessionRow",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1379-8248",
      },
      {
        name: "빈 목록",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1254-5857",
      },
    ],
  },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={[CONVERSATION_PATH]}>
        <Routes>
          {[PATH_ROUTE.CHAT, PATH_ROUTE.CHAT_SESSION].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                // 대화 목록 드로어의 내용 너비(280px - 좌우 여백 32px)와 높이를 흉내 내요
                <div style={{ width: "15.5rem", height: "30rem" }}>
                  <Story />
                </div>
              }
            />
          ))}
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof SearchConversationList>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 대화 하나를 보고 있는 탐색 화면이에요. 보고 있는 대화가 채워진 모양으로 표시돼요. */
export const Default: Story = {};

/** 대화가 여러 기간에 걸쳐 쌓인 워크스페이스예요. 묶음이 최근 기간부터 나오고, 긴 제목은 말줄임표로 잘려요. */
export const AllPeriods: Story = {
  parameters: {
    // 문서 페이지에서는 스토리를 한 화면에 함께 그려 응답이 섞이므로, 이 스토리는 따로 그려요
    docs: { story: { inline: false, iframeHeight: 520 } },
    msw: {
      handlers: {
        conversations: http.get(CONVERSATIONS_URL, () =>
          HttpResponse.json({
            items: [
              ...searchConversationsResponse.items,
              {
                id: 103,
                title: "스프린트 3 회고에서 나온 배포 자동화 개선 아이디어 정리",
                lastMessagePreview: "배포 자동화는 다음 스프린트에서 진행하기로 했어요.",
                createdAt: fromNow(12 * DAY),
                updatedAt: fromNow(10 * DAY),
              },
              {
                id: 104,
                title: "API 명세 리뷰",
                lastMessagePreview: "오류 코드 표기는 대문자 스네이크 케이스로 맞췄어요.",
                createdAt: fromNow(50 * DAY),
                updatedAt: fromNow(45 * DAY),
              },
            ],
            nextCursor: null,
          }),
        ),
      },
    },
  },
};

/**
 * 대화 목록을 불러오지 못했을 때예요. 서버 오류, 네트워크 문제, 잘못된 요청(400)이 모두 이 모습이에요.
 * 대화가 없는 빈 목록과 헷갈리지 않게, 목록 자리 가운데에 작은 안내와 「다시 시도」를 보여 줘요.
 * 이 스토리에서는 「다시 시도」를 눌러도 계속 실패해요.
 */
export const LoadFailed: Story = {
  parameters: {
    docs: { story: { inline: false, iframeHeight: 520 } },
    msw: {
      handlers: {
        conversations: http.get(
          CONVERSATIONS_URL,
          () => new HttpResponse(null, { status: 500 }),
        ),
      },
    },
  },
};
