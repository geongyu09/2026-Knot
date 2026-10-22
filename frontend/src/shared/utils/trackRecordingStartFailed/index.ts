import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";

import type { MicrophonePermission } from "@/shared/types/recording";

interface TrackRecordingStartFailedParams {
  /** 시작하지 못한 결과. `useRecordingControl`의 `startRecording`이 돌려주는 값 중 안내 창을 띄우는 값이에요 */
  result: "microphoneUnavailable" | "refused" | "networkFailed";
  /** 마이크를 받지 못한 오류 이름(`NotAllowedError` 등). 마이크를 받았으면 `null`이에요 */
  errorName: string | null;
  /** 녹음을 누를 때의 마이크 권한 상태 */
  permissionBefore: MicrophonePermission;
  /** 시작하지 못한 뒤의 마이크 권한 상태 */
  permissionAfter: MicrophonePermission;
  /** 이 탭에서 새로고침 전까지 몇 번째로 시작하지 못했는지 */
  attempt: number;
  /** 어디서 녹음을 눌렀는지. 독의 마이크 또는 녹음 바의 「이어서 녹음」이에요 */
  surface: "dock" | "recorder_bar";
  workspaceId: number;
}

const REASON_BY_RESULT = {
  microphoneUnavailable: "microphone_unavailable",
  refused: "refused",
  networkFailed: "network_failed",
} as const;

/**
 * @description 녹음을 시작하지 못한 이유를 사용 기록(`recording_start_failed`)으로 보내요
 * @param params - 시작하지 못한 결과, 마이크 오류 이름, 앞뒤 권한 상태, 몇 번째 실패인지, 누른 곳, 워크스페이스 id
 * @example
 * trackRecordingStartFailed({ result: "microphoneUnavailable", errorName: "NotAllowedError", ... });
 *
 * 오류 이름이 없으면(서버 거절 · 네트워크 문제) `error_name`을 빼고 보내요.
 */
export const trackRecordingStartFailed = ({
  result,
  errorName,
  permissionBefore,
  permissionAfter,
  attempt,
  surface,
  workspaceId,
}: TrackRecordingStartFailedParams) => {
  captureAnalyticsEvent({
    event: "recording_start_failed",
    properties: {
      reason: REASON_BY_RESULT[result],
      ...(errorName ? { error_name: errorName } : {}),
      permission_before: permissionBefore,
      permission_after: permissionAfter,
      attempt,
      surface,
      workspace_id: workspaceId,
    },
  });
};
