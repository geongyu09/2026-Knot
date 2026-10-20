import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";

import type { RecordingAudioMode } from "@/shared/types/recording";

interface TrackRecordingEndedParams {
  workspaceId: number;
  recordingId: number;
  audioMode: RecordingAudioMode;
  /** 녹음 끝내기의 결과. `useRecordingControl`의 `endRecordingWithoutConfirm`이 돌려주는 값이에요 */
  result: "uploaded" | "notUploaded" | "notEnded";
}

const RESULT_BY_END_RESULT = {
  uploaded: "uploaded",
  notUploaded: "not_uploaded",
} as const;

/**
 * @description 녹음을 끝낸 결과를 사용 기록(`recording_ended`)으로 보내요
 * @param params - 녹음 세션의 워크스페이스 · 녹음 id와 녹음 방식, 끝내기 결과
 * @example
 * trackRecordingEnded({ ...session, result });
 *
 * 끝내지 못했으면(`notEnded`) 녹음이 이어지므로 보내지 않아요.
 */
export const trackRecordingEnded = ({
  workspaceId,
  recordingId,
  audioMode,
  result,
}: TrackRecordingEndedParams) => {
  if (result === "notEnded") return;

  captureAnalyticsEvent({
    event: "recording_ended",
    properties: {
      result: RESULT_BY_END_RESULT[result],
      audio_mode: audioMode,
      recording_id: recordingId,
      workspace_id: workspaceId,
    },
  });
};
