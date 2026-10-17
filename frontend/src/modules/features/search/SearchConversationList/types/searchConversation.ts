/**
 * 대화 목록에 놓이는 탐색 대화 한 건.
 * 대화 목록 조회 응답(`SearchConversationDto`)에서 목록이 쓰는 필드만 골랐어요. 응답을 그대로 넘길 수 있어요.
 */
export interface SearchConversationListItem {
  id: number;
  title: string;
  updatedAt: string;
}

/**
 * 같은 기간에 묶인 대화 묶음. `label`은 "오늘"처럼 목록 위에 붙는 기간 이름이에요.
 */
export interface SearchConversationGroup {
  label: string;
  conversations: SearchConversationListItem[];
}
