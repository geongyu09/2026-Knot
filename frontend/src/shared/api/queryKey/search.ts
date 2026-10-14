interface SearchMessagesKeyParams {
  workspaceId: number;
  /** 대화 ID. 없으면 아직 질문을 보내지 않은 새 대화라 조회하지 않아요 */
  conversationId?: number;
}

/**
 * 탐색 쿼리 키
 *
 * - `messages` 한 탐색 대화의 메시지 목록
 */
export const searchKeys = {
  all: ["search"] as const,

  messages: ({ workspaceId, conversationId }: SearchMessagesKeyParams) =>
    [...searchKeys.all, "messages", workspaceId, conversationId] as const,
};
