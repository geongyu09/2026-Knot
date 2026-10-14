import type {
  SearchConversationGroup,
  SearchConversationListItem,
} from "../types/searchConversation";

interface GroupSearchConversationsParams {
  conversations: SearchConversationListItem[];
  now?: Date;
}

interface GetGroupIndexParams {
  updatedAt: Date;
  now: Date;
}

const DAY = 24 * 60 * 60 * 1000;

/** 목록에 보여줄 기간 묶음. 최근 기간부터 순서대로 씁니다. */
const GROUP_LABELS = ["오늘", "이번 주", "지난 30일", "이전"] as const;

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getGroupIndex = ({ updatedAt, now }: GetGroupIndexParams) => {
  if (isSameDay(updatedAt, now)) return 0;

  const elapsed = now.getTime() - updatedAt.getTime();

  if (elapsed < 7 * DAY) return 1;
  if (elapsed < 30 * DAY) return 2;

  return 3;
};

/**
 * 대화 목록을 "오늘 / 이번 주 / 지난 30일 / 이전" 기간으로 묶습니다.
 *
 * 오늘은 날짜가 같은지로 가르고, 나머지는 지금으로부터 지난 시간으로 가릅니다.
 * 같은 묶음 안에서는 마지막으로 메시지가 오간 대화가 위로 옵니다.
 *
 * @param conversations - 묶을 대화 목록
 * @param now - 비교 기준 시각. 기본값은 현재 시각
 * @returns 대화가 있는 묶음만 최근 기간 순으로 담은 목록
 *
 * @example
 * groupSearchConversations({ conversations });
 * // [{ label: "오늘", conversations: [...] }]
 */
export const groupSearchConversations = ({
  conversations,
  now = new Date(),
}: GroupSearchConversationsParams) => {
  const grouped: SearchConversationListItem[][] = GROUP_LABELS.map(() => []);

  for (const conversation of conversations) {
    const index = getGroupIndex({
      updatedAt: new Date(conversation.updatedAt),
      now,
    });

    grouped[index].push(conversation);
  }

  const groups: SearchConversationGroup[] = [];

  grouped.forEach((groupConversations, index) => {
    if (groupConversations.length === 0) return;

    groups.push({
      label: GROUP_LABELS[index],
      conversations: [...groupConversations].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    });
  });

  return groups;
};
