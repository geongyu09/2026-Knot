import styled from "@emotion/styled";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useRef } from "react";

import GhostIcon from "@/assets/icons/ghost.svg";

import ParticleIcon, { type ParticleIconHandle } from ".";

/** 독의 고스트 아이콘과 같은 모양. 입자가 모일 자리를 뽑는 데 써요 */
const drawGhost = (context: CanvasRenderingContext2D) => {
  context.lineWidth = 1.1;
  context.stroke(
    new Path2D(
      "M22 12.3006C22 6.61173 17.5228 2 12 2C6.47715 2 2 6.61173 2 12.3006V19.723C2 21.0453 3.35098 21.9054 4.4992 21.314C5.42726 20.836 6.5328 20.9069 7.39614 21.4998C8.36736 22.1667 9.63264 22.1667 10.6039 21.4998L10.9565 21.2576C11.5884 20.8237 12.4116 20.8237 13.0435 21.2576L13.3961 21.4998C14.3674 22.1667 15.6326 22.1667 16.6039 21.4998C17.4672 20.9069 18.5727 20.836 19.5008 21.314C20.649 21.9054 22 21.0453 22 19.723V16.0118",
    ),
  );
  context.fill(
    new Path2D(
      "M16 10.5C16 11.3284 15.5523 12 15 12C14.4477 12 14 11.3284 14 10.5C14 9.67157 14.4477 9 15 9C15.5523 9 16 9.67157 16 10.5ZM8 10.5C8 10.8978 8.10536 11.2794 8.29289 11.5607C8.48043 11.842 8.73478 12 9 12C9.26522 12 9.51957 11.842 9.70711 11.5607C9.89464 11.2794 10 10.8978 10 10.5C10 10.1022 9.89464 9.72064 9.70711 9.43934C9.51957 9.15804 9.26522 9 9 9C8.73478 9 8.48043 9.15804 8.29289 9.43934C8.10536 9.72064 8 10.1022 8 10.5Z",
    ),
  );
};

const Stage = styled.div<{ $isOnDark: boolean }>`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: fit-content;
  padding: 1rem 1.25rem;
  border-radius: 1.25rem; /* 20px */
  background-color: ${({ theme, $isOnDark }) => ($isOnDark ? theme.neutral[800] : theme.neutral[50])};
  color: ${({ theme, $isOnDark }) => ($isOnDark ? theme.neutral[300] : theme.neutral[800])};
`;

const Action = styled.button`
  padding: 0.375rem 0.75rem;
  border-radius: 0.5rem;
  background-color: ${({ theme }) => theme.neutral[0]};
  color: ${({ theme }) => theme.neutral[800]};
  ${({ theme }) => theme.text.caption02};
`;

/** 버튼으로 모으기와 깨우기를 눌러 볼 수 있게 감싸요 */
function Playground({ isOnDark }: { isOnDark: boolean }) {
  const ref = useRef<ParticleIconHandle>(null);

  return (
    <Stage $isOnDark={isOnDark}>
      <ParticleIcon ref={ref} draw={drawGhost} size={24} isOnDark={isOnDark}>
        <GhostIcon size={24} />
      </ParticleIcon>
      <Action type="button" onClick={() => ref.current?.assemble()}>
        입자로 모으기
      </Action>
      <Action type="button" onClick={() => ref.current?.wake()}>
        잠깐 깨우기
      </Action>
    </Stage>
  );
}

/**
 * 입자로 모였다가 진짜 아이콘이 되는 아이콘이에요. 독의 고스트 아이콘과 보내기 화살표가 이 컴포넌트를 써요.
 *
 * **어떻게 움직이나**
 * - 평소엔 넘겨받은 아이콘이 그대로 보여요. 캔버스는 비어 있어요.
 * - `assemble()`을 부르면 입자가 위에서 떨어져 아이콘 모양으로 모이고, 자리를 잡으면 진짜 아이콘으로 바뀌어요. 랜딩이 입자로 글자를 만든 뒤 진짜 글자로 바꾸는 방식과 같아요. 독은 처음 나타날 때와 펼치고 접을 때 불러요.
 * - `wake()`를 부르면 아이콘이 잠깐 입자로 풀렸다가 다시 모여요. 독은 접힌 고스트에 마우스를 올렸을 때 불러요.
 *
 * **규칙**
 * - `isOnDark`가 `true`면 밝은 입자, `false`면 잉크색 입자예요. 보내기 버튼처럼 밝은 바탕에서는 `false`로 둬요.
 * - `draw`에는 24×24 좌표계에서 아이콘과 같은 모양을 그려요. 입자가 모일 자리는 여기서 뽑아요.
 * - 움직임 줄이기 설정이나 캔버스를 못 쓰는 환경에서는 바로 진짜 아이콘만 보여요. 캔버스는 장식이라 낭독기에서 숨겨요.
 */
const meta = {
  title: "Shared/ParticleIcon",
  component: ParticleIcon,
  args: { draw: drawGhost, size: 24, isOnDark: true, children: <GhostIcon size={24} /> },
  render: (args) => <Playground isOnDark={args.isOnDark ?? true} />,
} satisfies Meta<typeof ParticleIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 어두운 독 위의 고스트 아이콘이에요. 「입자로 모으기」로 모이는 모습을, 「잠깐 깨우기」로 올렸을 때의 반응을 볼 수 있어요. */
export const Default: Story = {};

/** 밝은 바탕 위의 잉크색 입자예요. 예: 보내기 버튼의 화살표 */
export const OnLight: Story = {
  args: { isOnDark: false },
};
