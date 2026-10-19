import posthog from "posthog-js";

import type { RecordingAudioMode } from "@/shared/types/recording";

/**
 * PostHog로 보내는 이벤트와 그 속성이에요. 클릭 · 페이지 이동은 PostHog가 자동으로 기록하므로, 클릭으로 셀 수 없는 결과만 여기에 둬요.
 *
 * 이름은 PostHog 관례대로 snake_case로 쓰고, 한 번 정하면 바꾸지 않아요. 바꾸면 PostHog에서 이전 기록과 다른 이벤트로 갈라져요.
 * 읽기 쉬운 한글 이름은 PostHog의 액션 · 인사이트에 붙여요.
 * 질문 글 · 문서 내용 같은 본문은 넣지 않고, id와 결과 값만 넣어요.
 */
interface AnalyticsEventMap {
  /** 녹음을 끝내고 업로드 결과가 정해졌어요. 끝내지 못했으면 보내지 않아요 */
  recording_ended: {
    result: "uploaded" | "not_uploaded";
    audio_mode: RecordingAudioMode;
    recording_id: number;
    workspace_id: number;
  };
  /** 정리 화면에서 「정리 중」을 본 뒤 결과가 정해졌어요. 이미 결과가 난 녹음을 다시 열면 보내지 않아요 */
  recording_documents_result: {
    result: "completed" | "no_content" | "failed" | "audio_save_failed";
    /** 실패했을 때만 있어요. 전사에서 실패했는지, 문서 만들기에서 실패했는지예요 */
    failure_stage?: "transcription" | "document_generation";
    /** 완료했을 때만 있어요. 그 녹음에서 만들어진 문서 수예요. 문서 보기의 스테퍼 전체 수와 같아요 */
    document_count?: number;
    recording_id: number;
    workspace_id: number;
  };
  /** 정리 화면의 다시 시도에 서버가 응답했어요. 거절은 409 · 404, 오류는 5xx · 네트워크 문제예요 */
  recording_documents_retry: {
    stage: "transcription" | "document_generation";
    result: "accepted" | "rejected" | "error";
    recording_id: number;
    workspace_id: number;
  };
  /** 탐색 답변이 끝났어요. 사용자가 받기를 끊었으면 결과가 없어 보내지 않아요 */
  search_answer_result: {
    result: "completed" | "stopped" | "failed" | "accept_failed";
    is_retry: boolean;
    is_first_question: boolean;
  };
}

type AnalyticsEvent = keyof AnalyticsEventMap;

interface CaptureAnalyticsEventParams<Event extends AnalyticsEvent> {
  event: Event;
  properties: AnalyticsEventMap[Event];
}

/**
 * @description 핵심 흐름의 결과를 PostHog 이벤트로 보내요
 * @param event - 이벤트 이름. 예: `recording_ended`
 * @param properties - 그 이벤트의 속성. 이벤트마다 받는 값이 정해져 있어요
 * @example
 * captureAnalyticsEvent({
 *   event: "recording_ended",
 *   properties: { result: "uploaded", audio_mode, recording_id, workspace_id },
 * });
 *
 * `src/index.tsx`는 PostHog 키가 있을 때만 PostHog를 켜요. 키가 없는 로컬 · 테스트에서는 보내지 않아요.
 */
export const captureAnalyticsEvent = <Event extends AnalyticsEvent>({
  event,
  properties,
}: CaptureAnalyticsEventParams<Event>) => {
  if (!process.env.POSTHOG_KEY) return;

  posthog.capture(event, properties);
};
