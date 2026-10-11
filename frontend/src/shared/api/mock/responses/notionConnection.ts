import type { NotionConnectionResponse } from "@api/mock/types/notionConnection";

// 기본값은 연결된 상태 하나만 둬요. NOT_CONNECTED·REAUTH_REQUIRED는 테스트에서 mockServer.use로 덮어요
export const notionConnectionResponse = {
  status: "CONNECTED",
} satisfies NotionConnectionResponse;
