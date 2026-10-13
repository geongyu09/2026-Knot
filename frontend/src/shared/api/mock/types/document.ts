export interface DocumentConfirmationSummary {
  confirmedCount: number;
  pendingCount: number;
  excludedCount: number;
}

/** 문서 상태 */
export type DocumentStatus = "DRAFT" | "ARCHIVED";

/** 내 확인 상태. 상세 · 목록 응답이 같은 기준을 씀 */
export type MyConfirmationState = "PENDING" | "CONFIRMED" | "NOT_REQUIRED";

export interface DocumentTopic {
  topic: string;
  /** 조회 조건(myConfirmation · recordingSessionId)을 만족하는 그 주제의 문서 수. cursor · size는 반영하지 않음 */
  documentCount: number;
}

export interface DocumentListItem {
  id: number;
  recordingSessionId: number;
  topic: string;
  title: string;
  /** 없으면 null */
  summary: string | null;
  status: DocumentStatus;
  createdAt: string;
  recordingDurationSeconds: number;
  myConfirmationState: MyConfirmationState;
  confirmationSummary: DocumentConfirmationSummary;
}

export interface DocumentsResponse {
  /** 조회 조건을 만족하는 문서가 있는 주제 전체. cursor · size와 관계없이 전체가 옴 */
  topics: DocumentTopic[];
  items: DocumentListItem[];
  /** 마지막 페이지면 null */
  nextCursor: string | null;
}

export interface DocumentDetailResponse {
  id: number;
  recordingSessionId: number;
  topic: string;
  title: string;
  /** 없으면 null */
  summary: string | null;
  content: string;
  status: DocumentStatus;
  createdAt: string;
  /** DRAFT면 null */
  archivedAt: string | null;
  recordingDurationSeconds: number;
  sourceTranscriptId: number;
  myConfirmationState: MyConfirmationState;
  confirmationSummary: DocumentConfirmationSummary;
}

export interface DocumentConfirmationItem {
  memberId: number;
  nickname: string;
  /** 없으면 null */
  profileImageUrl: string | null;
  /** 확인하지 않았으면 null */
  confirmedAt: string | null;
  state: "CONFIRMED" | "PENDING" | "EXCLUDED";
}

export interface DocumentConfirmationsResponse {
  documentId: number;
  confirmedCount: number;
  pendingCount: number;
  excludedCount: number;
  confirmedByMe: boolean;
  items: DocumentConfirmationItem[];
  /** 마지막 페이지면 null */
  nextCursor: string | null;
}

export interface DocumentMyConfirmationResponse {
  documentId: number;
  confirmedAt: string;
  documentStatus: DocumentStatus;
  /** DRAFT면 null */
  archivedAt: string | null;
  confirmationSummary: DocumentConfirmationSummary;
}

export interface DocumentTranscriptSegment {
  /** 녹음한 오디오의 시작을 0으로 한 발화 시작 위치(ms) */
  startMillis: number;
  /** 알 수 없으면 null */
  endMillis: number | null;
  /** 화자를 알 수 없으면 null */
  speakerNumber: number | null;
  text: string;
}

export interface DocumentTranscriptResponse {
  transcriptId: number;
  /** 지금은 늘 false */
  isPartial: boolean;
  recordingDurationSeconds: number;
  transcriptText: string;
  /** 1개 이상. 시작 시각 오름차순 */
  segments: DocumentTranscriptSegment[];
}
