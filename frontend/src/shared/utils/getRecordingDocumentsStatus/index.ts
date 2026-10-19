interface GetRecordingDocumentsStatusParams {
  /** 녹음 세션 상태. `DISCARDED`는 서버가 버린 녹음이에요 */
  sessionStatus: "RECORDING" | "PAUSED" | "ENDED" | "DISCARDED";
  /** 전사 상태. 전사를 시도하기 전이면 null */
  transcriptionStatus: "PROCESSING" | "SUCCEEDED" | "FAILED" | null;
  /** 문서 생성 결과. 문서 생성이 접수되기 전이면 null */
  documentGeneration: {
    /** 주제 분류와 주제별 문서 생성을 합친 상태 */
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "NO_CONTENT";
  } | null;
}

/**
 * 문서 생성 상태가 어느 정리 상태가 되는지 정한 표.
 *
 * 함수가 이 표를 `documentGeneration.status`로 읽으므로, 서버 상태가 늘었는데 여기에 없으면 읽는 줄에서 타입 오류가 나요.
 */
const RECORDING_DOCUMENTS_STATUS_BY_DOCUMENT_GENERATION_STATUS = {
  QUEUED: "organizing",
  RUNNING: "organizing",
  SUCCEEDED: "completed",
  NO_CONTENT: "noContent",
  FAILED: "failed",
} as const;

/**
 * 녹음 조회 응답의 세 값으로, 녹음을 끝낸 뒤의 문서 정리가 어디까지 됐는지 정해요.
 *
 * 서버는 세션 상태 · 전사 상태 · 문서 생성 결과를 따로 줘요. 이 셋을 하나로 합친 값이 필요한 곳(정리 화면, 녹음을 다시 조회할지 정하는 쿼리 훅)이 같은 기준을 쓰도록 여기서 정해요.
 *
 * - `recording`: 아직 끝내지 않은 녹음(녹음 중 · 일시정지)
 * - `organizing`: 끝낸 녹음의 결과가 아직 정해지지 않았어요. 업로드 확인 전 · 전사 중 · 문서 생성 대기와 진행이 모두 여기예요
 * - `completed`: 모든 주제의 문서가 만들어졌어요
 * - `noContent`: 문서로 정리할 내용이 없었어요
 * - `failed`: 전사가 실패했거나, 진행 중인 작업 없이 문서 생성 실패가 남았어요. 문서가 일부만 만들어진 경우도 여기예요
 * - `unsupported`: 위의 어느 상태로도 볼 수 없는 값이에요. 서버가 버린 녹음(`DISCARDED`)이거나, 세션 상태 · 문서 생성 상태가 타입에 없는 값이면 여기예요
 *
 * 전사 상태는 실패(`FAILED`)인지만 봐요. 그 밖의 값은 타입에 없는 값이어도 문서 생성 결과가 올 때까지 `organizing`이에요.
 * 전사가 어디까지 됐는지는 화면이 쓰지 않아서, 서버에 전사 상태 값이 늘어도 정리 중으로 기다리는 것이 맞아요.
 *
 * @example
 * getRecordingDocumentsStatus({
 *   sessionStatus: "ENDED",
 *   transcriptionStatus: "SUCCEEDED",
 *   documentGeneration: { status: "RUNNING" },
 * }); // "organizing"
 */
export const getRecordingDocumentsStatus = ({
  sessionStatus,
  transcriptionStatus,
  documentGeneration,
}: GetRecordingDocumentsStatusParams) => {
  // 문자열을 그대로 돌려주면 돌려주는 타입이 string으로 넓어져, 쓰는 쪽이 어떤 값이 오는지 알 수 없어요. 그래서 값마다 `as const`를 붙여요
  if (sessionStatus === "RECORDING" || sessionStatus === "PAUSED") {
    return "recording" as const;
  }

  if (sessionStatus !== "ENDED") return "unsupported" as const;

  // 전사가 실패하면 문서 생성이 접수되지 않아요. 이 값을 보지 않으면 결과가 계속 없는 것으로 보여 정리 중에서 끝나지 않아요
  if (transcriptionStatus === "FAILED") return "failed" as const;

  if (documentGeneration === null) return "organizing" as const;

  // 타입에 없는 상태를 서버가 보내면 표에서 undefined가 나와요
  return (
    RECORDING_DOCUMENTS_STATUS_BY_DOCUMENT_GENERATION_STATUS[
      documentGeneration.status
    ] ?? ("unsupported" as const)
  );
};
