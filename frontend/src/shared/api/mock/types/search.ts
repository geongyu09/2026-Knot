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

/**
 * 실패한 답변 재시도 SSE 스트림의 값들. 질문·답변 ID는 요청 경로에서 받아 채워요.
 *
 * accepted가 첫 질문과 달라요. 대화 ID 없이 재사용한 질문 ID(`questionId`)와 답변 ID, 접수 상태(`STREAMING`)를 보내요.
 * 나머지 이벤트는 첫 질문과 같아요
 */
export type SearchAnswerRetryStream = Omit<
  SearchAnswerStream,
  "conversationId" | "questionMessageId" | "answerMessageId"
>;

/** 재시도 accepted 이벤트의 data. 서버가 보내는 모양 그대로예요 */
export interface SearchAnswerRetryAccepted {
  /** 재사용한 USER 질문 ID. 요청 경로의 질문 ID와 같아요 */
  questionId: number;
  /** 재사용한 ASSISTANT 답변 ID. 질문 바로 다음 메시지예요 */
  answerMessageId: number;
  /** 접수 상태. 늘 STREAMING이고 끝은 후속 이벤트로 알아요 */
  status: "STREAMING";
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
