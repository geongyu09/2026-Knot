import { uploadRecordingAudioChunkApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/audioChunks";
import { useMutation } from "@tanstack/react-query";

interface UploadRecordingAudioChunkMutationVariables {
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  pcm: ArrayBuffer;
}

/**
 * 예약 응답의 서명 URL로 PCM 조각을 객체 저장소에 직접 올리는 뮤테이션 훅.
 *
 * 우리 API가 아니라 요청 DTO가 없고, 실패는 axios 오류 그대로 넘겨요(이미 객체가 있으면 412).
 * PUT 성공은 저장 완료가 아니라서 이어서 저장 확인 뮤테이션을 보내야 해요.
 */
const useUploadRecordingAudioChunkMutation = () => {
  return useMutation({
    mutationFn: (variables: UploadRecordingAudioChunkMutationVariables) =>
      uploadRecordingAudioChunkApi(variables),
  });
};

export default useUploadRecordingAudioChunkMutation;
