import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";

interface TrackRecordingStartResultParams {
  workspaceId: number;
  /** 녹음 시작의 결과. `useRecordingControl`의 `startRecording`이 돌려주는 값이에요 */
  result:
    | "started"
    | "microphoneUnavailable"
    | "refused"
    | "networkFailed"
    | "failed"
    | "uploading"
    | "ignored";
  /** 누른 뒤 결과가 정해질 때까지 걸린 시간(ms) */
  waitMs: number;
}

const RESULT_BY_START_RESULT = {
  started: "started",
  microphoneUnavailable: "microphone_unavailable",
  refused: "refused",
  networkFailed: "network_failed",
  failed: "failed",
  uploading: "uploading",
} as const;

/**
 * @description 독에서 녹음을 시작한 결과와 기다린 시간을 사용 기록(`recording_start_result`)으로 보내요
 * @param params - 워크스페이스 id, 시작 결과, 누른 뒤 기다린 시간(ms)
 * @example
 * trackRecordingStartResult({ workspaceId: 3, result: "started", waitMs: 1830 });
 *
 * 시작 중에 다시 눌러 무시된 경우(`ignored`)는 앞의 누름이 결과를 보내므로 보내지 않아요.
 */
export const trackRecordingStartResult = ({
  workspaceId,
  result,
  waitMs,
}: TrackRecordingStartResultParams) => {
  if (result === "ignored") return;

  captureAnalyticsEvent({
    event: "recording_start_result",
    properties: {
      result: RESULT_BY_START_RESULT[result],
      wait_seconds: Math.round(waitMs / 100) / 10,
      workspace_id: workspaceId,
    },
  });
};
