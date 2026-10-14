/**
 * 채팅 쿼리 키
 *
 * - `messages` 한 세션의 메시지 이력
 */
export const chatKeys = {
  all: ["chat"] as const,

  messages: (sessionId: number | null) =>
    [...chatKeys.all, "messages", sessionId] as const,
};
