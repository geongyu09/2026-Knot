import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { useEffect, useRef } from "react";

import type { RecordingDocumentsViewStatus } from "../types/recordingDocuments";

/** 정리 결과인 화면 상태와 사용 기록(`recording_documents_result`)의 결과 값 */
const RESULT_BY_VIEW_STATUS = {
  completed: "completed",
  noContent: "no_content",
  failed: "failed",
  audioSaveFailed: "audio_save_failed",
} as const;

const isResultViewStatus = (
  viewStatus: RecordingDocumentsViewStatus,
): viewStatus is keyof typeof RESULT_BY_VIEW_STATUS =>
  viewStatus in RESULT_BY_VIEW_STATUS;

interface UseCaptureRecordingDocumentsResultParams {
  workspaceId: number;
  recordingId: number;
  viewStatus: RecordingDocumentsViewStatus;
  /** 실패했을 때 전사에서 실패했는지. 아니면 문서 만들기에서 실패했어요 */
  isTranscriptionFailed: boolean;
  /** 녹음에서 만들어진 문서 수(녹음 조회 응답의 성공 수). 정리가 끝났을 때 보내요 */
  documentCount: number | undefined;
}

/**
 * 정리 화면에서 「정리 중」을 본 뒤 결과가 정해지면 그 결과를 사용 기록(`recording_documents_result`)으로 보내요.
 *
 * 이미 결과가 난 녹음을 다시 열면 정리 중을 거치지 않아 보내지 않아요. 같은 녹음이 두 번 세어지지 않게 하기 위해서예요.
 * 실패 화면에서 다시 시도해 정리 중을 다시 본 뒤 결과가 나면 그 결과를 한 번 더 보내요.
 */
export const useCaptureRecordingDocumentsResult = ({
  workspaceId,
  recordingId,
  viewStatus,
  isTranscriptionFailed,
  documentCount,
}: UseCaptureRecordingDocumentsResultParams) => {
  // 정리 중에서 결과로 바뀌는 순간을 알려고 바로 앞 상태를 기억해요
  const previousViewStatusRef = useRef(viewStatus);

  useEffect(() => {
    const previousViewStatus = previousViewStatusRef.current;
    previousViewStatusRef.current = viewStatus;

    if (
      previousViewStatus !== "organizing" ||
      !isResultViewStatus(viewStatus)
    ) {
      return;
    }

    captureAnalyticsEvent({
      event: "recording_documents_result",
      properties: {
        result: RESULT_BY_VIEW_STATUS[viewStatus],
        ...(viewStatus === "failed" && {
          failure_stage: isTranscriptionFailed
            ? "transcription"
            : "document_generation",
        }),
        ...(viewStatus === "completed" && { document_count: documentCount }),
        recording_id: recordingId,
        workspace_id: workspaceId,
      },
    });
  }, [
    documentCount,
    isTranscriptionFailed,
    recordingId,
    viewStatus,
    workspaceId,
  ]);
};
