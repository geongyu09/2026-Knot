import type useRetryDocumentGenerationJobsMutation from "@api/mutations/useRetryDocumentGenerationJobsMutation";
import type useRecordingQuery from "@api/queries/useRecordingQuery";
import { recordingKeys, recordingMutationKeys } from "@api/queryKey/recording";
import { useMutationState, useQueryClient } from "@tanstack/react-query";
import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { trackRecordingDocumentsRetry } from "@utils/trackRecordingDocumentsRetry";
import { useEffect, useRef, useState } from "react";

import type { RecordingDocumentsViewStatus } from "../types/recordingDocuments";

type Recording = NonNullable<ReturnType<typeof useRecordingQuery>["data"]>;
type DocumentRetryResults = NonNullable<
  ReturnType<typeof useRetryDocumentGenerationJobsMutation>["data"]
>;

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

interface UseRecordingDocumentsAnalyticsParams {
  workspaceId: number;
  recordingId: number;
  viewStatus: RecordingDocumentsViewStatus;
}

/**
 * 정리 화면에서 일어난 일을 사용 기록으로 보내는 훅. 화면의 상태와 다시 시도 응답을 지켜보기만 하고, 정리 화면의 동작은 바꾸지 않아요.
 *
 * - 정리 결과(`recording_documents_result`): 「정리 중」을 본 뒤 결과로 바뀌면 보내요. 실패면 전사 · 문서 만들기 중 어디서 실패했는지,
 *   완료면 만들어진 문서 수(녹음 조회 응답의 성공 수)를 함께 보내요. 이미 결과가 난 녹음을 다시 열면 정리 중을 거치지 않아 보내지 않아요.
 * - 다시 시도 응답(`recording_documents_retry`): 전사 · 문서 다시 시도 뮤테이션이 끝나면 뮤테이션 캐시에서 응답을 읽어 보내요.
 *   캐시에는 앞서 다른 화면에서 보낸 다시 시도도 잠시 남아 있어서, 이 화면을 연 뒤에 보낸 것만 한 번씩 보내요.
 */
export const useRecordingDocumentsAnalytics = ({
  workspaceId,
  recordingId,
  viewStatus,
}: UseRecordingDocumentsAnalyticsParams) => {
  const queryClient = useQueryClient();
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

    const recording = queryClient.getQueryData<Recording>(
      recordingKeys.detail({ workspaceId, recordingId }),
    );

    captureAnalyticsEvent({
      event: "recording_documents_result",
      properties: {
        result: RESULT_BY_VIEW_STATUS[viewStatus],
        ...(viewStatus === "failed" && {
          failure_stage:
            recording?.transcriptionStatus === "FAILED"
              ? "transcription"
              : "document_generation",
        }),
        ...(viewStatus === "completed" && {
          document_count: recording?.documentGeneration?.succeededCount,
        }),
        recording_id: recordingId,
        workspace_id: workspaceId,
      },
    });
  }, [queryClient, recordingId, viewStatus, workspaceId]);

  const [mountedAt] = useState(() => Date.now());
  const trackedRetryIdsRef = useRef(new Set<number>());
  const transcriptionRetries = useMutationState({
    filters: {
      mutationKey: recordingMutationKeys.transcriptionRetry(),
      predicate: ({ state }) =>
        state.status === "success" || state.status === "error",
    },
    select: ({ mutationId, state }) => ({
      mutationId,
      submittedAt: state.submittedAt,
      // 접수된 요청은 오류 자리에 null을 둬요
      errors: [state.status === "success" ? null : state.error],
    }),
  });
  const documentRetries = useMutationState({
    filters: {
      mutationKey: recordingMutationKeys.documentGenerationRetry(),
      status: "success",
    },
    // 작업마다의 실패는 결과값으로 바뀌어 뮤테이션은 늘 성공으로 끝나요
    select: ({ mutationId, state }) => ({
      mutationId,
      submittedAt: state.submittedAt,
      errors: ((state.data ?? []) as DocumentRetryResults).map(
        ({ error }) => error,
      ),
    }),
  });

  useEffect(() => {
    const retries = [
      ...transcriptionRetries.map((retry) => ({
        ...retry,
        stage: "transcription" as const,
      })),
      ...documentRetries.map((retry) => ({
        ...retry,
        stage: "document_generation" as const,
      })),
    ];

    retries.forEach(({ mutationId, submittedAt, errors, stage }) => {
      const trackedRetryIds = trackedRetryIdsRef.current;
      if (submittedAt < mountedAt || trackedRetryIds.has(mutationId)) return;

      trackedRetryIds.add(mutationId);
      trackRecordingDocumentsRetry({
        stage,
        errors,
        workspaceId,
        recordingId,
      });
    });
  }, [
    documentRetries,
    mountedAt,
    recordingId,
    transcriptionRetries,
    workspaceId,
  ]);
};
