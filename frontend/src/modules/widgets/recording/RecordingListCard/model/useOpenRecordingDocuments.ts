import useNavigateToRecordingDocuments from "@hooks/domain/recording/useNavigateToRecordingDocuments";

import { useWorkspaceId } from "./useWorkspaceId";

interface UseOpenRecordingDocumentsParams {
  /** 문서를 정리하는 녹음의 ID. 정리 중인 녹음이 없으면 `null` */
  recordingId: number | null;
}

/**
 * 문서 정리 중인 녹음의 문서 정리 화면으로 가는 핸들러.
 *
 * 녹음 화면과 달리 문서 정리 화면은 어느 탭에서나 열 수 있어, 녹음을 끝낸 탭이 아니어도 갈 수 있어요.
 */
export const useOpenRecordingDocuments = ({
  recordingId,
}: UseOpenRecordingDocumentsParams) => {
  const workspaceId = useWorkspaceId();
  const { navigateToRecordingDocuments } = useNavigateToRecordingDocuments();

  const handleOpenRecordingDocuments = () => {
    if (!workspaceId || recordingId === null) return;

    navigateToRecordingDocuments({ workspaceId, recordingId });
  };

  return { handleOpenRecordingDocuments };
};
