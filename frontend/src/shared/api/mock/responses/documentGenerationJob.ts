import type { DocumentGenerationJobRetryResponse } from "@api/mock/types/documentGenerationJob";

// 녹음 mock에서 문서 만들기에 실패한 녹음(12)의 작업(88)을 처음 다시 시도했을 때의 응답이에요
export const documentGenerationJobRetryResponse = {
  jobId: 88,
  status: "QUEUED",
  attemptCount: 2,
} satisfies DocumentGenerationJobRetryResponse;

// 다시 시도할 수 있는 횟수를 다 쓴 작업의 ID. 실패 작업으로 남아 있지만 다시 시도하면 서버가 거절해요.
// 녹음 mock에서 그런 작업만 남은 녹음(15)의 실패 작업이에요
export const RETRY_EXHAUSTED_JOB_ID = 91;
