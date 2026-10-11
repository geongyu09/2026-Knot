/** Notion 연결 상태 조회 응답 */
export interface NotionConnectionResponse {
  /** 연결 상태. 연결된 적이 없어도 404가 아니라 NOT_CONNECTED로 와요 */
  status: "NOT_CONNECTED" | "CONNECTED" | "REAUTH_REQUIRED";
}
