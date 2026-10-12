import useKeyDown from "@hooks/common/useKeyDown";
import ConfirmDialog from "@primitives/ui/ConfirmDialog";
import Dim from "@primitives/ui/Dim";
import { useDialog } from "@provider/context/dialogContext";
import { useCallback } from "react";

const TITLE = "녹음을 시작할 수 없어요";

interface RecordingStartRefusedDialogProps {
  onClose: () => void;
}

/**
 * 서버가 녹음 시작을 거절했을 때 [닫기]/[새로고침] 모달을 띄우는 도메인 훅.
 *
 * 다른 탭에서 이미 녹음 중이거나 이미 끝난 요청을 다시 보낸 경우처럼 시작 에러 전부에 같은 모달을 써요.
 * [닫기]는 모달만 닫고, [새로고침]은 페이지를 새로고침해요.
 */
const useRecordingStartRefusedDialog = () => {
  const { open } = useDialog();

  const openRecordingStartRefusedDialog = useCallback(
    () => open(({ close }) => <RecordingStartRefusedDialog onClose={close} />),
    [open],
  );

  return { openRecordingStartRefusedDialog };
};

/**
 * 녹음을 시작할 수 없을 때의 확인 모달.
 *
 * 바깥을 누르거나 ESC를 눌러도 [닫기]와 같이 모달만 닫혀요.
 *
 * @see {@link https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3800-38046 녹음/시작할 수 없음}
 */
function RecordingStartRefusedDialog({
  onClose,
}: RecordingStartRefusedDialogProps) {
  useKeyDown({ key: "Escape", isEnabled: true, onKeyDown: onClose });

  return (
    <Dim onClick={onClose}>
      <ConfirmDialog
        role="dialog"
        aria-modal="true"
        aria-label={TITLE}
        onClick={(e) => e.stopPropagation()}
        title={TITLE}
        description="올바르지 않은 접근이에요. 새로고침한 뒤 다시 시도해 주세요."
        cancelLabel="닫기"
        confirmLabel="새로고침"
        onCancel={onClose}
        onConfirm={() => window.location.reload()}
      />
    </Dim>
  );
}

export default useRecordingStartRefusedDialog;
