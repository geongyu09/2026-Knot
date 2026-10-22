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
 * 소리 크기의 흐름을 보여 주는 입자 파형이에요. 녹음 화면 상단 바에서 녹음한 시간 옆의 남은 폭을 채워요.
 *
 * **어떻게 보이나**
 * - 오른쪽 끝이 지금 소리예요. 말하면 그 순간의 자리만 소리만큼 커지고, 50ms마다 한 칸씩 왼쪽으로 흘러가 약 5초가 한눈에 보여요.
 * - 조용하면 가운데에 가는 선만 남고 저절로 움직이지 않아요. 보통 크기로 말하면 높이의 절반 넘게, 크게 말하면 끝까지 커져요.
 * - 입자는 가운데가 빽빽하고 세로 위치에 따라 잉크 세 단계로 그려요.
 * - 올리면 입자가 포인터를 피하고, 누르면 파동이 퍼져요. 연달아 누르면 파동이 세져요.
 *
 * **규칙**
 * - `isActive`가 `false`면 일시정지라 이력을 비우고 옅은 색의 평평한 선으로 멈춰 있어요. 이어서 녹음하면 오른쪽부터 다시 채워져요.
 * - 「내 말이 지금 들리고 있다」를 보여 주는 것이 역할이에요. 낭독기에서는 읽지 않고, 움직임 줄이기 설정에서는 흔들림 없이 소리만 따라요.
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

/** 소리가 없을 때예요. 가는 선만 남고 움직이지 않아요. 예: 아무도 말하지 않는 순간 */
export const Silent: Story = {
  args: { analyser: null },
};

/** 일시정지해 평평한 선으로 옅어진 파형이에요. 예: 회의 중 쉬는 시간 */
export const Paused: Story = {
  args: { isActive: false },
};
