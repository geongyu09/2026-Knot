import styled from "@emotion/styled";
import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useRef } from "react";

import SpeechBubbleIcon from "@/assets/icons/speechBubble.svg";

import ParticleIcon, { type ParticleIconHandle } from ".";

/** 독의 말풍선 아이콘과 같은 모양. 입자가 모일 자리를 뽑는 데 써요 */
const drawSpeechBubble = (context: CanvasRenderingContext2D) => {
  context.lineWidth = 1.4;
  context.stroke(
    new Path2D(
      "M6.5 4.75H17.5C19.0188 4.75 20.25 5.98122 20.25 7.5V14C20.25 15.5188 19.0188 16.75 17.5 16.75H11.4L7.75 19.9V16.75H6.5C4.98122 16.75 3.75 15.5188 3.75 14V7.5C3.75 5.98122 4.98122 4.75 6.5 4.75Z",
    ),
  );
  [8.75, 12, 15.25].forEach((x) => {
    context.beginPath();
    context.arc(x, 10.75, 1, 0, Math.PI * 2);
    context.fill();
  });
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
      <ParticleIcon ref={ref} draw={drawSpeechBubble} size={24} isOnDark={isOnDark}>
        <SpeechBubbleIcon size={24} />
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
 * 입자로 모였다가 진짜 아이콘이 되는 아이콘이에요. 독의 말풍선 아이콘과 보내기 화살표가 이 컴포넌트를 써요.
 *
 * **어떻게 움직이나**
 * - 평소엔 넘겨받은 아이콘이 그대로 보여요. 캔버스는 비어 있어요.
 * - `assemble()`을 부르면 입자가 위에서 떨어져 아이콘 모양으로 모이고, 자리를 잡으면 진짜 아이콘으로 바뀌어요. 랜딩이 입자로 글자를 만든 뒤 진짜 글자로 바꾸는 방식과 같아요. 독은 처음 나타날 때와 펼치고 접을 때 불러요.
 * - `wake()`를 부르면 아이콘이 잠깐 입자로 풀렸다가 다시 모여요. 독은 접힌 말풍선 아이콘에 마우스를 올렸을 때 불러요.
 *
 * **규칙**
 * - `isOnDark`가 `true`면 밝은 입자, `false`면 잉크색 입자예요. 보내기 버튼처럼 밝은 바탕에서는 `false`로 둬요.
 * - `draw`에는 24×24 좌표계에서 아이콘과 같은 모양을 그려요. 입자가 모일 자리는 여기서 뽑아요.
 * - 움직임 줄이기 설정이나 캔버스를 못 쓰는 환경에서는 바로 진짜 아이콘만 보여요. 캔버스는 장식이라 낭독기에서 숨겨요.
 */
const meta = {
  title: "Shared/ParticleIcon",
  component: ParticleIcon,
  args: { draw: drawSpeechBubble, size: 24, isOnDark: true, children: <SpeechBubbleIcon size={24} /> },
  render: (args) => <Playground isOnDark={args.isOnDark ?? true} />,
} satisfies Meta<typeof ParticleIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 어두운 독 위의 말풍선 아이콘이에요. 「입자로 모으기」로 모이는 모습을, 「잠깐 깨우기」로 올렸을 때의 반응을 볼 수 있어요. */
export const Default: Story = {};

/** 밝은 바탕 위의 잉크색 입자예요. 예: 보내기 버튼의 화살표 */
export const OnLight: Story = {
  args: { isOnDark: false },
};
