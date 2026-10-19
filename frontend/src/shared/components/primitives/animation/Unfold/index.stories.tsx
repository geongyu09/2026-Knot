import styled from "@emotion/styled";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useState } from "react";

import Button from "@primitives/ui/Button";

import Unfold from ".";

/** 예시 메뉴. 실제 메뉴처럼 `styled(Unfold)`로 이어 받아 모양만 더해요 */
const Menu = styled(Unfold)`
  display: flex;
  flex-direction: column;
  gap: 0.125rem; /* 2px */
  width: 15rem; /* 240px */
  padding: 0.375rem; /* 6px */
  border: 1px solid ${({ theme }) => theme.neutral[200]};
  border-radius: 1rem; /* 16px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow03};
`;

const MenuItem = styled.span`
  padding: 0.5rem 0.625rem; /* 8px 10px */
  ${({ theme }) => theme.text.body01};
  color: ${({ theme }) => theme.neutral[800]};
`;

/** 다시 그려서 펼쳐지는 애니메이션을 처음부터 다시 보여 줘요 */
function ReplayStage() {
  const [playCount, setPlayCount] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Button
        size="md"
        variant="outline"
        onClick={() => setPlayCount((count) => count + 1)}
      >
        다시 보기
      </Button>
      <Menu key={playCount}>
        <MenuItem>Knot 팀</MenuItem>
        <MenuItem>새 워크스페이스 만들기</MenuItem>
      </Menu>
    </div>
  );
}

/**
 * 트리거 아래로 뜨는 메뉴나 팝오버가 위쪽 끝에서 세로로 펼쳐지며(0.2초) 나타나게 하는 애니메이션이에요.
 * 확인한 사람 목록 팝오버(`Popover`)와 사이드바 맨 위의 워크스페이스 메뉴가 이걸 이어 받아 써요.
 *
 * - 띄우는 요소는 `styled(Unfold)`로 이어 받아 자기 모양만 더해요. 그래서 메뉴마다 같은 애니메이션을 다시 쓰지 않아요.
 * - 띄운 쪽이 닫는 동안 이 요소나 감싼 요소에 `data-overlay-state="closing"`을 붙이면 다시 접히며(0.25초) 사라져요.
 * - 움직임 줄이기 설정을 켠 사용자에게는 모션 없이 바로 나타나고 사라져요.
 *
 * 접히며 사라지는 모습은 `Shared/Popover`와 `Workspace/WorkspaceSwitcher`에서 실제로 볼 수 있어요.
 */
const meta = {
  title: "Shared/Unfold",
  component: Unfold,
  render: () => <ReplayStage />,
} satisfies Meta<typeof Unfold>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 메뉴가 펼쳐지는 모습이에요. [다시 보기]를 누르면 처음부터 다시 펼쳐져요 */
export const Default: Story = {};
