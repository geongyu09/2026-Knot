import {
  documentDetailsResponse,
  documentsResponse,
} from "@api/mock/responses/document";
import {
  documentGenerationJobRetryResponse,
  RETRY_EXHAUSTED_JOB_ID,
} from "@api/mock/responses/documentGenerationJob";
import type {
  CurrentRecordingResponse,
  RecordingAudioUploadCompleteResponse,
  RecordingAudioUploadUrlResponse,
  RecordingDetailEntry,
  RecordingDetailResponse,
  RecordingEndResponse,
  RecordingHeartbeatResponse,
  RecordingPauseResponse,
  RecordingResumeResponse,
  RecordingStartResponse,
} from "@api/mock/types/recording";

const MINUTE = 60 * 1000;

// 고정 시각은 언젠가 만료·과거가 되므로 지금 기준으로 만들어요
const fromNow = (offset: number) => new Date(Date.now() + offset).toISOString();

/**
 * Presigned URL이 가리키는 가짜 객체 저장소. 실제 저장소는 우리 API와 오리진이 달라
 * 와일드카드 대신 이 오리진으로 PUT을 가로채요
 */
export const MOCK_AUDIO_STORAGE_ORIGIN = "https://audio-storage.knot.mock";

export const currentRecordingResponse = {
  recordingId: 10,
  status: "RECORDING",
  startedAt: fromNow(-12 * MINUTE),
  elapsedMillis: 12 * MINUTE,
} satisfies CurrentRecordingResponse;

export const recordingStartResponse = {
  recordingId: 10,
  status: "RECORDING",
  startedAt: fromNow(0),
} satisfies RecordingStartResponse;

export const recordingPauseResponse = {
  recordingId: 10,
  status: "PAUSED",
  pausedAt: fromNow(0),
  elapsedMillis: 10 * MINUTE,
} satisfies RecordingPauseResponse;

export const recordingResumeResponse = {
  recordingId: 10,
  status: "RECORDING",
  resumedAt: fromNow(0),
  elapsedMillis: 10 * MINUTE,
} satisfies RecordingResumeResponse;

export const recordingEndResponse = {
  recordingId: 10,
  status: "ENDED",
  endedAt: fromNow(0),
} satisfies RecordingEndResponse;

// 서버는 마지막 신호부터 30초 동안 신호가 없으면 녹음을 끝내요
export const recordingHeartbeatResponse = {
  recordingId: 10,
  status: "RECORDING",
  elapsedMillis: 10 * MINUTE,
  lastSeenAt: fromNow(0),
  expiresAt: fromNow(MINUTE / 2),
  endedAt: null,
  endReason: null,
  serverNow: fromNow(0),
} satisfies RecordingHeartbeatResponse;

// 32분 녹음을 8분 전에 끝내고 오디오 업로드까지 확인된 뒤의 공통 값이에요
const endedRecording = {
  status: "ENDED",
  elapsedMillis: 32 * MINUTE,
  endedAt: fromNow(-8 * MINUTE),
  endReason: "USER_ENDED",
  audioUploadStatus: "COMPLETED",
} satisfies Partial<RecordingDetailResponse>;

const TRANSCRIPTION_ATTEMPT_ID = "d0a03c18-1687-4512-8f79-1df67a8e56ef";

// 전사까지 끝나 문서 생성이 접수된 뒤의 공통 값이에요
const transcribedRecording = {
  ...endedRecording,
  transcriptionAttemptId: TRANSCRIPTION_ATTEMPT_ID,
  transcriptionStatus: "SUCCEEDED",
  transcriptionFailureCode: null,
} satisfies Partial<RecordingDetailResponse>;

// 문서 mock의 문서(회원 탈퇴 정책 · 홈 개편 논의)가 나온 녹음의 ID.
// 정리가 끝난 녹음을 이 ID로 둬야, 정리 화면이 그 녹음의 문서로 이어져요
const [{ recordingSessionId: COMPLETED_RECORDING_ID }] =
  documentDetailsResponse;

// 녹음을 끝낸 뒤의 상태를 녹음마다 하나씩 둬, 정리 화면 주소의 녹음 ID만 바꿔 각 상태를 볼 수 있어요.
// 차례로 정리 중 · 문서로 만들 내용 없음 · 문서 만들기 실패 · 전사 실패 · 정리 완료 ·
// 일부만 만들어진 실패(실패한 작업 둘) · 다시 시도 횟수를 다 쓴 실패예요.
// 10은 녹음 시작·종료 mock과 같은 녹음이라, 끝낸 직후에 보게 되는 정리 중으로 뒀어요
export const recordingDetailsResponse = [
  {
    recordingId: 10,
    detail: {
      ...transcribedRecording,
      documentGeneration: {
        status: "RUNNING",
        succeededCount: 0,
        failedJobIds: [],
      },
    },
  },
  {
    recordingId: 11,
    detail: {
      ...transcribedRecording,
      documentGeneration: {
        status: "NO_CONTENT",
        succeededCount: 0,
        failedJobIds: [],
      },
    },
  },
  {
    recordingId: 12,
    detail: {
      ...transcribedRecording,
      documentGeneration: {
        status: "FAILED",
        succeededCount: 0,
        // 다시 시도 mock 응답(documentGenerationJobRetryResponse)이 가리키는 작업이에요
        failedJobIds: [documentGenerationJobRetryResponse.jobId],
      },
    },
  },
  {
    recordingId: 13,
    detail: {
      ...endedRecording,
      transcriptionAttemptId: TRANSCRIPTION_ATTEMPT_ID,
      transcriptionStatus: "FAILED",
      transcriptionFailureCode: "AI_TIMEOUT",
      // 전사가 실패하면 문서 생성이 접수되지 않아요
      documentGeneration: null,
    },
  },
  {
    recordingId: COMPLETED_RECORDING_ID,
    detail: {
      ...transcribedRecording,
      documentGeneration: {
        status: "SUCCEEDED",
        succeededCount: documentsResponse.items.filter(
          ({ recordingSessionId }) =>
            recordingSessionId === COMPLETED_RECORDING_ID,
        ).length,
        failedJobIds: [],
      },
    },
  },
  {
    recordingId: 14,
    detail: {
      ...transcribedRecording,
      // 주제 넷 가운데 둘은 문서가 만들어졌고, 나머지 둘의 작업이 실패했어요
      documentGeneration: {
        status: "FAILED",
        succeededCount: 2,
        failedJobIds: [89, 90],
      },
    },
  },
  {
    recordingId: 15,
    detail: {
      ...transcribedRecording,
      documentGeneration: {
        status: "FAILED",
        succeededCount: 0,
        // 다시 시도하면 서버가 거절하는 작업이에요
        failedJobIds: [RETRY_EXHAUSTED_JOB_ID],
      },
    },
  },
] satisfies RecordingDetailEntry[];

export const recordingAudioUploadUrlResponse = {
  uploadId: 300,
  uploadUrl: `${MOCK_AUDIO_STORAGE_ORIGIN}/recordings/10/audio`,
  expiresAt: fromNow(5 * MINUTE),
} satisfies RecordingAudioUploadUrlResponse;

export const recordingAudioUploadCompleteResponse = {
  recordingId: 10,
  uploadId: 300,
  uploadStatus: "COMPLETED",
  completedAt: fromNow(0),
} satisfies RecordingAudioUploadCompleteResponse;
