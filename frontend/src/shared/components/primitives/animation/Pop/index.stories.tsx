import styled from "@emotion/styled";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useState } from "react";

import Button from "@primitives/ui/Button";

import Pop from ".";

/** 예시 카드. 실제 모달 카드처럼 `styled(Pop)`으로 이어 받아 모양만 더해요 */
const Card = styled(Pop)`
  padding: 2rem; /* 32px */
  border-radius: 1.25rem; /* 20px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow03};
  ${({ theme }) => theme.text.heading02};
  color: ${({ theme }) => theme.neutral[900]};
  text-align: center;
`;

/** 다시 그려서 나타나는 애니메이션을 처음부터 다시 보여 줘요 */
function ReplayStage() {
  const [playCount, setPlayCount] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <Button
        size="md"
        variant="outline"
        onClick={() => setPlayCount((count) => count + 1)}
      >
        다시 보기
      </Button>
      <Card key={playCount}>녹음을 끝낼까요?</Card>
    </div>
  );
}

/**
 * 화면 가운데 뜨는 카드가 살짝 커졌다가 제자리로 내려앉으며(0.5초) 나타나게 하는 애니메이션이에요.
 * `ConfirmDialog`, `AlertDialog`, `MemberSelectDialog` 같은 모달 카드가 이걸 이어 받아 써요.
 *
 * - 카드는 `styled(Pop)`으로 이어 받아 자기 모양만 더해요. 그래서 카드마다 같은 애니메이션을 다시 쓰지 않아요.
 * - 띄운 쪽(`DialogProvider`)이 닫는 동안 감싼 요소에 `data-overlay-state="closing"`을 붙이면 옅어지며(0.2초) 사라져요.
 * - 움직임 줄이기 설정을 켠 사용자에게는 모션 없이 바로 나타나고 사라져요.
 *
 * 닫히며 사라지는 모습은 `Shared/Dialog`에서 실제 모달로 볼 수 있어요.
 */
const meta = {
  title: "Shared/Pop",
  component: Pop,
  render: () => <ReplayStage />,
} satisfies Meta<typeof Pop>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 모달 카드가 나타나는 모습이에요. [다시 보기]를 누르면 처음부터 다시 나타나요 */
export const Default: Story = {};
