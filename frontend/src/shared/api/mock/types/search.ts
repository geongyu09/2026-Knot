export type SearchStreamStage = "SEARCHING" | "GENERATING";

/** 답변의 근거 문서. 메시지 조회의 evidences[]와 같은 모양이에요. evidence 이벤트의 items[]는 API 명세 미정이라 이 모양으로 임시 가정해요 */
export interface SearchEvidenceItem {
  documentId: number;
  title: string;
  topic: string;
  /** 1~3, 작을수록 관련도가 높아요 */
  rank: number;
}

/** 탐색 SSE 스트림 한 번이 흘려보낼 값들. 핸들러가 이 값으로 프레임을 만들어요 */
export interface SearchAnswerStream {
  conversationId: number;
  questionMessageId: number;
  answerMessageId: number;
  /** progress 이벤트로 차례로 보낼 단계 */
  stages: SearchStreamStage[];
  /** delta 이벤트로 차례로 보낼 답변 조각 */
  deltas: string[];
  /** evidence 이벤트의 items. 최대 3개 */
  evidences: SearchEvidenceItem[];
}

/** 후속 질문 SSE 스트림의 값들. 대화 ID는 요청 경로에서 받아 채워요 */
export type SearchQuestionAnswerStream = Omit<
  SearchAnswerStream,
  "conversationId"
>;

/** 실패한 답변 재시도 SSE 스트림의 값들. 대화·질문 ID는 요청 경로에서 받아 채워요 */
export type SearchAnswerRetryStream = Omit<
  SearchAnswerStream,
  "conversationId" | "questionMessageId" | "answerMessageId"
>;

/** 끊긴 답변 재연결 SSE 스트림의 값들. 답변 ID는 요청 경로에서 받아 채워요 */
export interface SearchAnswerEventsStream {
  /** snapshot 이벤트로 보낼, 다시 연결한 때까지 저장된 본문 */
  content: string;
  /** snapshot 뒤 delta 이벤트로 차례로 보낼 답변 조각 */
  deltas: string[];
  /** evidence 이벤트의 items. 최대 3개 */
  evidences: SearchEvidenceItem[];
}

/** 탐색 메시지 하나 */
export interface SearchMessage {
  id: number;
  role: "USER" | "ASSISTANT";
  sequence: number;
  content: string;
  status: "RECEIVED" | "STREAMING" | "COMPLETED" | "FAILED" | "STOPPED";
  createdAt: string;
  /** 질문(USER)은 빈 배열이에요 */
  evidences: SearchEvidenceItem[];
}

/** 탐색 메시지 조회 응답 */
export interface SearchMessages {
  conversationId: number;
  items: SearchMessage[];
  hasPrevious: boolean;
  previousCursor: string | null;
}

/** 대화 목록 한 줄 */
export interface SearchConversation {
  id: number;
  title: string;
  lastMessagePreview: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** 대화 목록 조회 응답 */
export interface SearchConversations {
  items: SearchConversation[];
  nextCursor: string | null;
}
