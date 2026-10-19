import { describe, it, expect } from "vitest";

import { groupSearchConversations } from "./groupSearchConversations";
import type { SearchConversationListItem } from "../types/searchConversation";

/** "오늘"은 달력상 같은 날인지로 갈리므로 기준 시각을 로컬 시각으로 잡습니다. */
const now = new Date(2026, 8, 1, 12, 0);

const createConversation = (
  id: number,
  updatedAt: Date,
): SearchConversationListItem => ({
  id,
  title: `대화 ${id}`,
  updatedAt: updatedAt.toISOString(),
});

describe("groupSearchConversations", () => {
  it("오늘·이번 주·지난 30일·이전 순으로 묶는다", () => {
    const conversations = [
      createConversation(1, new Date(2026, 8, 1, 9, 0)),
      createConversation(2, new Date(2026, 7, 30, 9, 0)),
      createConversation(3, new Date(2026, 7, 20, 9, 0)),
      createConversation(4, new Date(2026, 0, 1, 9, 0)),
    ];

    expect(groupSearchConversations({ conversations, now })).toEqual([
      { label: "오늘", conversations: [conversations[0]] },
      { label: "이번 주", conversations: [conversations[1]] },
      { label: "지난 30일", conversations: [conversations[2]] },
      { label: "이전", conversations: [conversations[3]] },
    ]);
  });

  it("[COMMON-01] 같은 기간의 대화는 최근에 오간 순으로 둔다", () => {
    const older = createConversation(1, new Date(2026, 8, 1, 1, 0));
    const newer = createConversation(2, new Date(2026, 8, 1, 9, 0));

    expect(groupSearchConversations({ conversations: [older, newer], now })).toEqual([
      { label: "오늘", conversations: [newer, older] },
    ]);
  });

  it("빈 기간은 목록에 두지 않는다", () => {
    const conversations = [createConversation(1, new Date(2026, 7, 20, 9, 0))];

    expect(groupSearchConversations({ conversations, now })).toEqual([
      { label: "지난 30일", conversations: [conversations[0]] },
    ]);
  });

  it("자정을 막 넘긴 어제 대화는 오늘로 묶지 않는다", () => {
    const conversations = [createConversation(1, new Date(2026, 7, 31, 23, 59))];

    expect(groupSearchConversations({ conversations, now })).toEqual([
      { label: "이번 주", conversations: [conversations[0]] },
    ]);
  });

  it("대화가 없으면 빈 목록을 만든다", () => {
    expect(groupSearchConversations({ conversations: [], now })).toEqual([]);
  });
});
