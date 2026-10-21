import styled from "@emotion/styled";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import ParticleOrb from ".";

/** 마이크 대신 소리 크기를 돌려주는 분석기. 실제 마이크 권한을 묻지 않고도 목소리가 들어오는 것처럼 보여 줘요. */
const createFakeAnalyser = () =>
  ({
    fftSize: 2048,
    getFloatTimeDomainData: (array: Float32Array) => {
      // 말하다 쉬다를 되풀이하듯 2초 주기로 커졌다 작아져요
      const phase = (Date.now() % 2000) / 2000;
      array.fill(Math.max(0, Math.sin(phase * Math.PI)) * 0.25);
    },
  }) as unknown as AnalyserNode;

/** 독처럼 어두운 바탕 위에 두어야 밝은 입자가 보여요 */
const DarkStage = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 7.5rem; /* 120px */
  height: 5rem; /* 80px */
  border-radius: 1.25rem; /* 20px */
  background-color: ${({ theme }) => theme.neutral[800]};
`;

/**
 * 랜딩의 입자로 만든 작은 구슬이에요. 독의 회의 녹음 버튼과 녹음 칩의 상태 표시가 이 구슬을 써요.
 *
 * **모양과 색**
 * - `shape`가 `cloud`면 입자 수백 개가 구름 같은 구를 이루며 천천히 돌고 숨 쉬어요. `mic`으로 바꾸면 마이크 아이콘, `arrow`로 바꾸면 오른쪽 화살표 모양으로 모여요. 독의 녹음 버튼은 올렸을 때 `mic`, 녹음 칩은 올렸을 때 `arrow`로 바꿔요.
 * - `tone`이 `idle`이면 녹음 전의 붉은빛(Warning), `recording`이면 녹음 중의 청록빛(Accent)이에요.
 *
 * **녹음 중 동작**
 * - `recording` 톤에서 `analyser`를 넘기면 목소리가 들어올 때마다 입자가 가운데를 가로지르는 파형으로 펼쳐지고, 조용하면 구름으로 돌아와요. 청록 빛무리가 맥박처럼 뛰어요.
 * - `isActive`가 `false`면 일시정지라 소리를 읽지 않고 빛무리도 쉬어요.
 *
 * **규칙**
 * - 장식이라 낭독기에서는 읽지 않아요. 접근성 이름은 감싸는 버튼이 가져요.
 * - 움직임 줄이기 설정에서는 회전·숨쉬기·흔들림을 멈추고 소리와 모양만 반영해요.
 * - 어두운 바탕에서 쓰도록 밝은 입자로 그려요.
 */
const meta = {
  title: "Shared/ParticleOrb",
  component: ParticleOrb,
  args: { radius: 12, size: 56, shape: "cloud", tone: "idle", isActive: true },
  argTypes: {
    shape: { control: "radio", options: ["cloud", "mic", "arrow"] },
    tone: { control: "radio", options: ["idle", "recording"] },
  },
  decorators: [
    (Story) => (
      <DarkStage>
        <Story />
      </DarkStage>
    ),
  ],
} satisfies Meta<typeof ParticleOrb>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 녹음 전의 구슬이에요. 예: 독의 회의 녹음 버튼 */
export const Default: Story = {};

/** 올리거나 포커스해 입자가 마이크 모양으로 모인 상태예요. 예: 독의 회의 녹음 버튼에 마우스를 올렸을 때 */
export const Mic: Story = {
  args: { shape: "mic" },
};

/** 녹음 칩에 올려 입자가 「녹음 화면으로 가기」 화살표로 모인 상태예요. */
export const Arrow: Story = {
  args: { radius: 7, size: 24, tone: "recording", shape: "arrow" },
};

/** 녹음 중이라 청록으로 바뀌고 목소리가 들어올 때마다 파형으로 펼쳐져요. 예: 녹음 칩의 상태 표시 */
export const Recording: Story = {
  args: { radius: 7, size: 24, tone: "recording", analyser: createFakeAnalyser() },
};

/** 녹음을 잠시 멈춰 소리를 읽지 않는 상태예요. 청록 구름이 조용히 떠 있어요. 예: 일시정지한 녹음의 칩 */
export const Paused: Story = {
  args: { radius: 7, size: 24, tone: "recording", analyser: createFakeAnalyser(), isActive: false },
};
