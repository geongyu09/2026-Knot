import styled from "@emotion/styled";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import ParticleWaveform from ".";

/** 마이크 대신 소리 크기를 돌려주는 분석기. 말하다 쉬다를 되풀이하듯 2초 주기로 커졌다 작아져요 */
const createFakeAnalyser = () =>
  ({
    fftSize: 2048,
    getFloatTimeDomainData: (array: Float32Array) => {
      const phase = (Date.now() % 2000) / 2000;
      array.fill(Math.max(0, Math.sin(phase * Math.PI)) * 0.2);
    },
  }) as unknown as AnalyserNode;

/** 녹음 바처럼 폭이 정해진 자리에 두어야 파형이 그 폭을 채워요 */
const Stage = styled.div`
  display: flex;
  width: min(30rem, 100%); /* 480px */
`;

/**
 * 랜딩 녹음 장면 그대로의 입자 파형이에요. 녹음 화면 상단 바에서 녹음한 시간 옆의 남은 폭을 채워요.
 *
 * **어떻게 보이나**
 * - 96칸 막대가 저마다 다른 박자로 출렁이고 양 끝으로 갈수록 낮아져요. 랜딩 녹음 장면과 같은 공식이에요.
 * - 소리가 없어도 숨 쉬듯 살짝 움직이고, 마이크 소리가 들어오면 그만큼 더 크게 퍼져요.
 * - 입자는 가운데가 빽빽하고 세로 위치에 따라 잉크 세 단계로 그려요.
 * - 올리면 입자가 포인터를 피하고, 누르면 파동이 퍼져요. 연달아 누르면 파동이 세져요.
 *
 * **규칙**
 * - `isActive`가 `false`면 일시정지라 숨을 멈추고 옅은 색으로 멈춰 있어요.
 * - 장식이라 낭독기에서는 읽지 않아요. 움직임 줄이기 설정에서는 흔들림과 숨쉬기 없이 소리만 따라요.
 */
const meta = {
  title: "Shared/ParticleWaveform",
  component: ParticleWaveform,
  args: { analyser: createFakeAnalyser(), isActive: true, height: 64 },
  decorators: [
    (Story) => (
      <Stage>
        <Story />
      </Stage>
    ),
  ],
} satisfies Meta<typeof ParticleWaveform>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 말하는 중인 파형이에요. 예: 녹음 화면에서 회의가 진행될 때 */
export const Default: Story = {};

/** 소리가 없을 때예요. 랜딩처럼 숨만 쉬어요. 예: 아무도 말하지 않는 순간 */
export const Silent: Story = {
  args: { analyser: null },
};

/** 일시정지해 숨을 멈추고 옅어진 파형이에요. 예: 회의 중 쉬는 시간 */
export const Paused: Story = {
  args: { isActive: false },
};
