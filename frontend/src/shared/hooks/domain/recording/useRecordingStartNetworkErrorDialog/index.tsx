import useKeyDown from "@hooks/common/useKeyDown";
import ConfirmDialog from "@primitives/ui/ConfirmDialog";
import Dim from "@primitives/ui/Dim";
import { useDialog } from "@provider/context/dialogContext";
import { useCallback } from "react";

const TITLE = "연결이 잠시 끊겼어요";

interface OpenRecordingStartNetworkErrorDialogParams {
  /** [다시 시도]를 누르면 모달을 닫은 뒤 불러요 */
  onRetry: () => void;
}

interface RecordingStartNetworkErrorDialogProps {
  onClose: () => void;
  onRetry: () => void;
}

/**
 * 녹음 시작 요청이 네트워크 문제로 응답을 받지 못했을 때 [닫기]/[다시 시도] 모달을 띄우는 도메인 훅(ERR-18).
 *
 * [닫기]는 모달만 닫고, [다시 시도]는 모달을 닫은 뒤 부른 쪽이 넘긴 시작을 다시 해요.
 */
const useRecordingStartNetworkErrorDialog = () => {
  const { open } = useDialog();

  const openRecordingStartNetworkErrorDialog = useCallback(
    ({ onRetry }: OpenRecordingStartNetworkErrorDialogParams) =>
      open(({ close }) => (
        <RecordingStartNetworkErrorDialog
          onClose={close}
          onRetry={() => {
            close();
            onRetry();
          }}
        />
      )),
    [open],
  );

  return { openRecordingStartNetworkErrorDialog };
};

/**
 * 녹음 시작이 네트워크 문제로 실패했을 때의 확인 모달.
 *
 * 바깥을 누르거나 ESC를 눌러도 [닫기]와 같이 모달만 닫혀요.
 *
 * @see {@link https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3804-8372 녹음/네트워크 오류}
 */
function RecordingStartNetworkErrorDialog({
  onClose,
  onRetry,
}: RecordingStartNetworkErrorDialogProps) {
  useKeyDown({ key: "Escape", isEnabled: true, onKeyDown: onClose });

  return (
    <Dim onClick={onClose}>
      <ConfirmDialog
        role="dialog"
        aria-modal="true"
        aria-label={TITLE}
        onClick={(e) => e.stopPropagation()}
        title={TITLE}
        description="네트워크 상태를 확인하고 다시 시도해 주세요."
        cancelLabel="닫기"
        confirmLabel="다시 시도"
        onCancel={onClose}
        onConfirm={onRetry}
      />
    </Dim>
  );
}

export default useRecordingStartNetworkErrorDialog;
