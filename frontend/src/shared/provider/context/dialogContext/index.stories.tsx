import AlertDialog from "@primitives/ui/AlertDialog";
import Button from "@primitives/ui/Button";
import ConfirmDialog from "@primitives/ui/ConfirmDialog";
import Dim from "@primitives/ui/Dim";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { DialogProvider, useDialog } from ".";

/** 저장이 끝났다고 보고 모달을 밖에서 닫기까지 기다리는 시간 */
const SAVING_DURATION_MS = 2000;

/** 확인 모달을 띄우는 버튼. 취소·확인 버튼이나 배경을 누르면 닫혀요 */
function ConfirmOpener() {
  const { open } = useDialog();

  const handleClick = () => {
    open(({ close }) => (
      <Dim onClick={close}>
        <ConfirmDialog
          role="dialog"
          aria-modal="true"
          aria-label="녹음을 끝낼까요?"
          onClick={(e) => e.stopPropagation()}
          title="녹음을 끝낼까요?"
          description="끝낸 녹음은 다시 이어 갈 수 없어요."
          cancelLabel="계속 녹음"
          confirmLabel="녹음 끝내기"
          onCancel={close}
          onConfirm={close}
        />
      </Dim>
    ));
  };

  return (
    <Button size="md" variant="filled" onClick={handleClick}>
      녹음 끝내기
    </Button>
  );
}

/** 모달 안에서 다음 모달로 넘어가는 버튼. 워크스페이스 나가기에서 owner 넘기기 → 삭제 확인으로 넘어가는 것과 같아요 */
function ReplaceOpener() {
  const { open } = useDialog();

  const openDeleteConfirm = () => {
    open(({ close }) => (
      <Dim onClick={close}>
        <ConfirmDialog
          role="dialog"
          aria-modal="true"
          aria-label="워크스페이스를 삭제할까요?"
          onClick={(e) => e.stopPropagation()}
          title="워크스페이스를 삭제할까요?"
          description="삭제한 워크스페이스는 되돌릴 수 없어요."
          cancelLabel="취소"
          confirmLabel="삭제"
          isDestructive
          onCancel={close}
          onConfirm={close}
        />
      </Dim>
    ));
  };

  const handleClick = () => {
    open(({ close }) => (
      <Dim onClick={close}>
        <ConfirmDialog
          role="dialog"
          aria-modal="true"
          aria-label="워크스페이스에서 나갈까요?"
          onClick={(e) => e.stopPropagation()}
          title="워크스페이스에서 나갈까요?"
          description="나가면 이 워크스페이스의 문서를 볼 수 없어요."
          cancelLabel="취소"
          confirmLabel="다음"
          onCancel={close}
          onConfirm={openDeleteConfirm}
        />
      </Dim>
    ));
  };

  return (
    <Button size="md" variant="filled" onClick={handleClick}>
      워크스페이스 나가기
    </Button>
  );
}

/** 안내 모달을 띄우고, 저장이 끝나면 모달 밖에서 닫는 버튼 */
function CloseFromOutsideOpener() {
  const { open } = useDialog();

  const handleClick = () => {
    const close = open(({ close }) => (
      <Dim>
        <AlertDialog
          role="alertdialog"
          aria-modal="true"
          aria-label="녹음을 저장하고 있어요"
          title="녹음을 저장하고 있어요"
          description="저장이 끝나면 저절로 닫혀요."
          confirmLabel="확인"
          onConfirm={close}
        />
      </Dim>
    ));

    setTimeout(close, SAVING_DURATION_MS);
  };

  return (
    <Button size="md" variant="filled" onClick={handleClick}>
      녹음 저장하기
    </Button>
  );
}

/**
 * 어느 화면에서든 `useDialog`로 모달을 띄우게 해 주는 프로바이더예요. 녹음 끝내기, 워크스페이스 나가기처럼 화면 가운데 뜨는 모달이 모두 이걸 거쳐요.
 *
 * **어떻게 뜨나**
 * - 열 때 배경(`Dim`)이 서서히 짙어지고(0.4초), 가운데 카드는 살짝 커졌다가 제자리로 내려앉으며(0.5초) 나타나요.
 * - 닫을 때는 배경과 카드가 함께 옅어지며(0.2초) 사라지고, 사라지는 동안에는 눌리지 않아요.
 * - 움직임 줄이기 설정을 켠 사용자에게는 모션 없이 바로 나타나고 사라져요.
 *
 * **동작 규칙**
 * - 모달은 한 번에 하나만 떠요. 떠 있는 동안 다른 모달을 열면 겹치지 않고 그 자리에서 바뀌어요.
 * - 닫히는 중에 다른 모달을 열면 닫힘을 기다리지 않고 바로 바뀌어요.
 * - 모달을 연 쪽이 돌려받은 `close`로 모달 밖에서도 닫을 수 있어요. 예: 저장이 끝나면 저절로 닫히는 안내
 *
 * 모달의 겉모양은 모르므로, 어떤 카드를 띄울지는 쓰는 쪽이 `Dim`과 카드를 함께 넘겨 정해요.
 */
const meta = {
  title: "Shared/Dialog",
  component: DialogProvider,
  argTypes: { children: { control: false } },
  args: { children: <ConfirmOpener /> },
} satisfies Meta<typeof DialogProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 동작 전에 한 번 더 묻는 모달을 열고 닫아요. 예: 녹음 끝내기 */
export const Default: Story = {};

/** 모달 안에서 다음 모달로 넘어가요. 예: 워크스페이스 나가기에서 삭제 확인으로 */
export const Replace: Story = {
  args: { children: <ReplaceOpener /> },
};

/** 모달을 연 쪽이 일이 끝난 뒤 모달 밖에서 닫아요. 예: 녹음 저장 안내가 2초 뒤 저절로 닫힘 */
export const CloseFromOutside: Story = {
  args: { children: <CloseFromOutsideOpener /> },
};
