import InlineError from "@primitives/ui/InlineError";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { fn } from "storybook/test";

import MemberSelectDialog from ".";

/**
 * 멤버 하나를 고르는 모달 카드예요. owner가 워크스페이스를 나갈 때 owner 권한을 넘길 멤버를 고르는 데 써요.
 *
 * - 제목과 안내 아래에 멤버 목록을 그리고, 그 아래에 보조(왼쪽) 버튼과 주(오른쪽) 버튼, 경고색 텍스트 링크를 차례로 둬요.
 * - 멤버를 고르기 전에는 주 버튼을 누를 수 없어요. 고르면 고른 행에 배경이 깔리고 주 버튼이 경고색으로 바뀌어요.
 * - 멤버가 5명을 넘으면 목록 안에서 스크롤해요.
 * - `memberListNotice`를 넘기면 목록 대신 그 자리 가운데에 안내를 둬요. 목록을 불러오지 못했을 때 `InlineError`를 넘겨 써요.
 *
 * **동작 규칙**
 * - 카드 모양만 그려요. 누구를 골랐는지는 쓰는 쪽이 `selectedMemberId`로 넘겨요. 여기서는 Controls에서 값을 바꿔 볼 수 있어요.
 * - 화면 가운데 띄우기와 ESC, 포커스 가두기는 없어서, 쓰는 쪽이 `Dim` 위에 올리고 `role`과 `aria-*`도 함께 넘겨요.
 */
const meta = {
  title: "Shared/MemberSelectDialog",
  component: MemberSelectDialog,
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2979-677",
    },
  },
  args: {
    title: "누구에게 owner를 넘길까요?",
    description:
      "owner 권한을 넘겨야 나갈 수 있어요.\n내가 만든 문서와 녹음은 그대로 남아요.",
    members: [
      { id: 1, name: "도넛" },
      { id: 2, name: "흑곰" },
      { id: 3, name: "루루" },
    ],
    selectedMemberId: null,
    onSelectMember: fn(),
    cancelLabel: "취소",
    confirmLabel: "넘기고 나가기",
    linkLabel: "워크스페이스 삭제하기",
    onCancel: fn(),
    onConfirm: fn(),
    onLinkClick: fn(),
  },
} satisfies Meta<typeof MemberSelectDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 창을 처음 띄웠을 때예요. 아직 아무도 고르지 않아 주 버튼을 누를 수 없어요. */
export const Default: Story = {};

/** 멤버를 고른 뒤예요. 고른 행에 배경이 깔리고 주 버튼을 누를 수 있어요. */
export const Selected: Story = {
  args: { selectedMemberId: 1 },
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2979-676",
    },
  },
};

/** 멤버가 5명을 넘을 때예요. 창이 길어지지 않고 목록 안에서 스크롤해요. */
export const ManyMembers: Story = {
  args: {
    members: [
      { id: 1, name: "도넛" },
      { id: 2, name: "흑곰" },
      { id: 3, name: "루루" },
      { id: 4, name: "루덴스" },
      { id: 5, name: "노티드" },
      { id: 6, name: "크루아상" },
      { id: 7, name: "마들렌" },
    ],
  },
};

/** 멤버 목록을 불러오지 못했을 때예요. 목록 자리에 실패 안내와 「다시 시도」를 두고, 고를 멤버가 없어 주 버튼을 누를 수 없어요. */
export const MemberListLoadFailed: Story = {
  args: {
    members: [],
    memberListNotice: (
      <InlineError
        message="멤버 목록을 불러오지 못했어요. 다시 시도해 주세요."
        onRetry={fn()}
        align="center"
      />
    ),
  },
};
