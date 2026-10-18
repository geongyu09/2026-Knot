import useBeforeUnload from "@hooks/common/useBeforeUnload";
import { useRecordingStore } from "@store/recordingStore";

/**
 * 녹음 중·일시정지 상태나 끝낸 녹음의 조각을 아직 올리는 중에 새로고침하거나 탭을 닫으려 하면 확인 창을 띄우는 도메인 훅.
 *
 * 녹음과 올리지 못한 조각은 브라우저 안에만 있어 페이지를 떠나면 사라지기 때문이에요.
 * 저장소 값 하나만 필요해 `useRecordingState` 대신 저장소에서 바로 읽어요.
 */
const useRecordingLeaveWarning = () => {
  const isLeaveBlocked = useRecordingStore(
    (state) => state.status !== "idle" || state.isUploadingChunks,
  );

  useBeforeUnload({ isEnabled: isLeaveBlocked });
};

export default useRecordingLeaveWarning;
