import { getRecordingAudioSaveApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/audioSave";
import { recordingKeys } from "@api/queryKey/recording";
import { useQuery } from "@tanstack/react-query";

interface UseRecordingAudioSaveQueryParams {
  workspaceId: number;
  recordingId: number;
}

/**
 * PCM 조각 녹음의 저장 상태를 조회하는 쿼리 훅.
 *
 * 저절로 다시 물어보지 않아요. 종료 뒤 저장이 끝나기를 기다리는 폴링 조건은 정리 화면 쪽에서 정해요.
 */
const useRecordingAudioSaveQuery = ({
  workspaceId,
  recordingId,
}: UseRecordingAudioSaveQueryParams) => {
  return useQuery({
    queryKey: recordingKeys.audioSave({ workspaceId, recordingId }),
    queryFn: () => getRecordingAudioSaveApi({ workspaceId, recordingId }),
  });
};

export default useRecordingAudioSaveQuery;
