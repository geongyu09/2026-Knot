import { getRecordingAudioSaveApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/audioSave";
import { isHttpError } from "@api/httpClient/error";
import { recordingKeys } from "@api/queryKey/recording";
import { useQuery } from "@tanstack/react-query";

/** 저장 결과가 정해지기 전의 저장 상태를 다시 물어보는 간격(ms). 녹음 상태 조회와 같아요 */
const POLL_INTERVAL_MS = 3000;

/** 더 바뀌지 않는 저장 상태. 최종 WAV 채택 · 재시도 소진 · 폐기예요 */
const SETTLED_AUDIO_SAVE_STATUSES = ["READY", "FAILED", "DISCARDED"];

interface UseRecordingAudioSaveQueryParams {
  workspaceId: number;
  recordingId: number;
  /** `false`면 조회하지 않아요. 전사가 시작된 뒤처럼 저장 결과가 더 필요 없을 때 꺼 둬요. 기본값은 `true` */
  isEnabled?: boolean;
}

/**
 * PCM 조각 녹음의 저장 상태를 조회하는 쿼리 훅.
 *
 * 켜 둔 동안 저장 결과가 정해질 때까지 3초 간격으로 다시 물어봐요. 결과가 정해지면(`READY` · `FAILED` · `DISCARDED`) 멈춰요.
 * 조회가 실패하면 오류 종류로 나눠요. WebM 녹음이라는 409(`AUDIO_MODE_CONFLICT`)처럼 다시 물어도 결과가 같은 오류(4xx)는 멈추고,
 * 네트워크 끊김이나 서버 오류는 잠깐의 문제일 수 있어 같은 간격으로 계속 물어봐요.
 * 녹음 상태 조회(`useRecordingQuery`)와 달리 받은 것이 없어도 계속 물어봐요. 이 조회의 실패로는 화면이 바뀌지 않아서예요.
 */
const useRecordingAudioSaveQuery = ({
  workspaceId,
  recordingId,
  isEnabled = true,
}: UseRecordingAudioSaveQueryParams) => {
  return useQuery({
    queryKey: recordingKeys.audioSave({ workspaceId, recordingId }),
    queryFn: () => getRecordingAudioSaveApi({ workspaceId, recordingId }),
    enabled: isEnabled,
    refetchInterval: ({ state: { data, error } }) => {
      if (isHttpError(error) && error.isClientError) return false;

      if (
        data !== undefined &&
        SETTLED_AUDIO_SAVE_STATUSES.includes(data.audioSaveStatus)
      ) {
        return false;
      }

      return POLL_INTERVAL_MS;
    },
  });
};

export default useRecordingAudioSaveQuery;
