import useLeaveWorkspaceMutation from "@api/mutations/useLeaveWorkspaceMutation";
import useTransferWorkspaceOwnershipMutation from "@api/mutations/useTransferWorkspaceOwnershipMutation";
import useOwnershipTransferCandidatesQuery from "@api/queries/useOwnershipTransferCandidatesQuery";
import useWorkspaceQuery from "@api/queries/useWorkspaceQuery";
import useKeyDown from "@hooks/common/useKeyDown";
import ConfirmDialog from "@primitives/ui/ConfirmDialog";
import Dim from "@primitives/ui/Dim";
import MemberSelectDialog from "@primitives/ui/MemberSelectDialog";
import { useDialog } from "@provider/context/dialogContext";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import { useRecordingStore } from "@store/recordingStore";
import { useState } from "react";
import { useNavigate } from "react-router";

const LEAVE_TITLE = "워크스페이스에서 나갈까요?";
const TRANSFER_TITLE = "누구에게 owner를 넘길까요?";
const DELETE_TITLE = "워크스페이스를 삭제할까요?";

interface UseLeaveWorkspaceDialogParams {
  /** 나가려는 워크스페이스 ID */
  workspaceId: number;
}

interface LeaveConfirmDialogProps {
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}

interface OwnerLeaveDialogProps {
  /** owner를 넘길 멤버를 받아 올 워크스페이스 ID */
  workspaceId: number;
  onCancel: () => void;
  /** 고른 멤버에게 owner를 넘기고 나갈 때 할 일 */
  onTransfer: (successorMemberId: number) => void;
  /** 삭제 확인 창에서 [삭제]를 눌렀을 때 할 일 */
  onDelete: () => void;
}

/**
 * 워크스페이스를 나가기 전에 내 처지에 맞는 확인 창을 띄우는 도메인 훅.
 *
 * - 일반 멤버: 나갈지 묻는 확인 창
 * - 다른 멤버가 있는 owner: owner를 넘길 멤버를 고르는 창. 여기서 워크스페이스 삭제 확인 창으로도 갈 수 있어요
 * - 나 혼자: 워크스페이스도 함께 삭제된다고 알리는 확인 창
 *
 * 어떤 창을 띄울지는 워크스페이스 조회의 내 역할과 멤버 수로 정해요.
 * 일반 멤버와 혼자인 경우는 나가기를, owner는 고른 멤버로 승계를 요청해요. 승계 요청이 탈퇴까지 처리해요.
 * 요청이 성공하면 이 탭에서 하던 녹음(일시정지 포함)을 버리고 진입 분기(`/`)로 보내, 남은 워크스페이스나 선택 화면으로 가게 해요.
 * 요청이 실패하면 지금 화면과 녹음을 그대로 둬요.
 *
 * 워크스페이스 삭제는 호출할 API가 없어(ADR 410) [삭제]를 눌러도 녹음만 버리고 창을 닫아요.
 *
 * 저장소의 동작 하나만 필요해 `useRecordingState` 대신 저장소에서 바로 읽어요.
 */
const useLeaveWorkspaceDialog = ({
  workspaceId,
}: UseLeaveWorkspaceDialogParams) => {
  const { open } = useDialog();
  const navigate = useNavigate();
  const discardRecording = useRecordingStore((state) => state.discardRecording);
  // 레이아웃의 진입 판정과 같은 쿼리라 요청은 한 번만 나가요
  const { data: workspace } = useWorkspaceQuery({ workspaceId });
  const { mutateAsync: leaveWorkspace } = useLeaveWorkspaceMutation();
  const { mutateAsync: transferOwnership } =
    useTransferWorkspaceOwnershipMutation();

  const openLeaveWorkspaceDialog = () => {
    // 내 역할과 멤버 수를 받아 오기 전에는 어떤 창을 띄울지 정할 수 없어요
    if (workspace === undefined) return;

    const { myRole, activeMemberCount } = workspace;

    open(({ close }) => {
      /** 창을 먼저 닫아 요청이 두 번 나가지 않게 하고, 요청이 성공했을 때만 녹음을 버리고 떠나요 */
      const leaveBy = async (request: () => Promise<unknown>) => {
        close();

        try {
          await request();
        } catch {
          return;
        }

        discardRecording();
        navigate(PATH_ROUTE.HOME, { replace: true });
      };

      const leave = () => leaveBy(() => leaveWorkspace({ workspaceId }));

      if (activeMemberCount === 1) {
        return (
          <LeaveConfirmDialog
            description={
              "남은 멤버가 없어 워크스페이스도 함께 삭제돼요.\n문서와 녹음을 다시 볼 수 없어요."
            }
            onCancel={close}
            onConfirm={leave}
          />
        );
      }

      if (myRole === "OWNER") {
        return (
          <OwnerLeaveDialog
            workspaceId={workspaceId}
            onCancel={close}
            onTransfer={(successorMemberId) =>
              leaveBy(() =>
                transferOwnership({ workspaceId, successorMemberId }),
              )
            }
            onDelete={() => {
              close();
              discardRecording();
            }}
          />
        );
      }

      return (
        <LeaveConfirmDialog
          description={
            "내가 만든 문서와 녹음은 그대로 남아요.\n다시 들어오려면 초대 코드가 필요해요."
          }
          onCancel={close}
          onConfirm={leave}
        />
      );
    });
  };

  return { openLeaveWorkspaceDialog };
};

/**
 * 워크스페이스에서 나갈지 묻는 확인 모달. 일반 멤버와 혼자 남은 경우에 안내만 바꿔 써요.
 *
 * 확인 유형이라 바깥을 누르거나 ESC를 눌러도 [취소]와 같이 모달만 닫혀요.
 *
 * @see {@link https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2167-24781 워크스페이스/나가기 확인}
 * @see {@link https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2979-14001 워크스페이스/혼자일 때 나가기 확인}
 */
function LeaveConfirmDialog({
  description,
  onCancel,
  onConfirm,
}: LeaveConfirmDialogProps) {
  useKeyDown({ key: "Escape", isEnabled: true, onKeyDown: onCancel });

  return (
    <Dim onClick={onCancel}>
      <ConfirmDialog
        role="dialog"
        aria-modal="true"
        aria-label={LEAVE_TITLE}
        onClick={(e) => e.stopPropagation()}
        title={LEAVE_TITLE}
        description={description}
        cancelLabel="취소"
        confirmLabel="나가기"
        isDestructive
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </Dim>
  );
}

/**
 * 다른 멤버가 있는 owner가 나갈 때의 모달. owner를 넘길 멤버를 고르거나 워크스페이스를 삭제해요.
 *
 * 고를 수 있는 멤버는 승계 후보 조회로 받아 오고, 받아 오기 전에는 목록을 비워 둬요.
 * 멤버 선택 창은 ESC로 닫히고, 바깥 클릭은 잘못 눌러 고른 멤버를 잃지 않도록 고르기 전에만 닫아요.
 * 삭제 확인 창의 [취소], 바깥 클릭, ESC는 고른 멤버를 그대로 둔 채 멤버 선택 창으로 돌아가요.
 *
 * @see {@link https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2979-13959 워크스페이스/owner 나가기}
 * @see {@link https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2979-13987 워크스페이스/삭제 확인}
 */
function OwnerLeaveDialog({
  workspaceId,
  onCancel,
  onTransfer,
  onDelete,
}: OwnerLeaveDialogProps) {
  const { data } = useOwnershipTransferCandidatesQuery({ workspaceId });
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const backToMemberSelect = () => setIsDeleteConfirmOpen(false);

  useKeyDown({
    key: "Escape",
    isEnabled: true,
    onKeyDown: isDeleteConfirmOpen ? backToMemberSelect : onCancel,
  });

  if (isDeleteConfirmOpen) {
    return (
      <Dim onClick={backToMemberSelect}>
        <ConfirmDialog
          role="dialog"
          aria-modal="true"
          aria-label={DELETE_TITLE}
          onClick={(e) => e.stopPropagation()}
          title={DELETE_TITLE}
          description={
            "멤버 모두 더 이상 들어올 수 없고,\n문서와 녹음도 함께 사라져요."
          }
          cancelLabel="취소"
          confirmLabel="삭제"
          isDestructive
          onCancel={backToMemberSelect}
          onConfirm={onDelete}
        />
      </Dim>
    );
  }

  return (
    <Dim onClick={selectedMemberId === null ? onCancel : undefined}>
      <MemberSelectDialog
        role="dialog"
        aria-modal="true"
        aria-label={TRANSFER_TITLE}
        onClick={(e) => e.stopPropagation()}
        title={TRANSFER_TITLE}
        description={
          "owner 권한을 넘겨야 나갈 수 있어요.\n내가 만든 문서와 녹음은 그대로 남아요."
        }
        members={(data?.candidates ?? []).map(({ memberId, nickname }) => ({
          id: memberId,
          name: nickname,
        }))}
        selectedMemberId={selectedMemberId}
        onSelectMember={setSelectedMemberId}
        cancelLabel="취소"
        confirmLabel="넘기고 나가기"
        linkLabel="워크스페이스 삭제하기"
        onCancel={onCancel}
        onConfirm={() => {
          if (selectedMemberId !== null) onTransfer(selectedMemberId);
        }}
        onLinkClick={() => setIsDeleteConfirmOpen(true)}
      />
    </Dim>
  );
}

export default useLeaveWorkspaceDialog;
