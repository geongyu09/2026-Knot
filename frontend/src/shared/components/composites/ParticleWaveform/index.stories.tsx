import type { Meta, StoryObj } from "@storybook/react-webpack5";

import ParticleWaveform from ".";

/** 말하는 중처럼 들쭉날쭉한 소리 크기 23개 */
const SPEAKING_LEVELS = [0.1, 0.3, 0.6, 0.8, 0.5, 0.2, 0.4, 0.9, 0.7, 0.3, 0.1, 0.2, 0.5, 0.8, 1, 0.6, 0.3, 0.2, 0.4, 0.7, 0.5, 0.2, 0.1];

/**
 * 랜딩 녹음 장면 같은 입자 파형이에요. 녹음 화면 상단 바에서 녹음한 시간 옆에 놓여요.
 *
 * **어떻게 보이나**
 * - 막대마다 소리 크기(`levels`, 0~1)만큼 입자가 세로로 퍼져요. 가운데가 빽빽하고 위아래로 갈수록 옅어요.
 * - 오른쪽 끝이 가장 새 소리예요. `levels`가 한 칸씩 밀리면 입자가 왼쪽으로 스프링처럼 흘러가요.
 * - 끝의 `pendingCount`개는 아직 들어오지 않은 소리 자리라 가장 낮고 흐려요.
 *
 * **규칙**
 * - `isActive`가 `false`면 일시정지라 흐름을 멈추고 전부 흐리게 그려요.
 * - 장식이라 낭독기에서는 읽지 않아요. 움직임 줄이기 설정에서는 흔들림 없이 자리만 따라가요.
 * - 폭은 막대 수와 `columnWidth`를 곱한 값이에요. 녹음 바는 26개×8px이에요.
 */
const meta = {
  title: "Shared/ParticleWaveform",
  component: ParticleWaveform,
  args: {
    levels: SPEAKING_LEVELS,
    pendingCount: 3,
    isActive: true,
    height: 30,
    minHeight: 4,
    columnWidth: 8,
  },
} satisfies Meta<typeof ParticleWaveform>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 말하는 중인 파형이에요. 예: 녹음 화면에서 회의가 진행될 때 */
export const Default: Story = {};

/** 조용할 때예요. 입자가 가장 낮게 모여 가는 선처럼 보여요. 예: 아무도 말하지 않는 순간 */
export const Silent: Story = {
  args: { levels: SPEAKING_LEVELS.map(() => 0) },
};

/** 일시정지해 마지막 모양에서 멈추고 전부 흐려진 파형이에요. 예: 회의 중 쉬는 시간 */
export const Paused: Story = {
  args: { isActive: false },
};
