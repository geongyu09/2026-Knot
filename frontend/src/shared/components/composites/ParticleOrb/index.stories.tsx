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
 * - `shape`가 `disc`면 테두리 고리 안에 붉은 원이 든 녹음 버튼이에요. 독의 녹음 버튼이 평소에 보여 주는 모양으로, `mic`으로 바꾸면 원이 입자로 분해됐다가 마이크로 모여요(`scatter()`를 함께 불러요).
 * - `wave`면 입자 전부가 세로 막대 파형이 되어 조용할 때도 숨 쉬고 목소리에 커져요. 녹음 칩이 평소에 보여 주는 모양으로, 올렸을 때 `arrow`로 바꿔 오른쪽 화살표로 모아요. 옆으로 길어 `width`를 넓게 줘요.
 * - `cloud`면 입자 수백 개가 구름 같은 구를 이루며 천천히 돌고 숨 쉬어요. 녹음을 기다리는 동안 써요.
 * - `tone`이 `idle`이면 녹음 전의 붉은빛(Warning), `neutral`이면 어두운 바탕 위의 밝은 회색이에요. 채팅 버튼과 녹음 칩, 녹음 시작 대기는 `neutral`이에요.
 *
 * **녹음 중 동작**
 * - `analyser`를 넘기면 목소리가 들어올 때마다 파형이 커져요.
 * - `isActive`가 `false`면 일시정지라 소리를 읽지 않아요. `wave`는 평평한 선이 돼요.
 * - `isWaiting`이면 결과를 기다리는 중이라 구름이 빠르게 돌며 모였다 풀렸다 해요. 녹음 버튼을 누른 뒤 녹음이 열릴 때까지 써요.
 *
 * **규칙**
 * - 장식이라 낭독기에서는 읽지 않아요. 접근성 이름은 감싸는 버튼이 가져요.
 * - 움직임 줄이기 설정에서는 회전·숨쉬기·흔들림을 멈추고 소리와 모양만 반영해요.
 * - 어두운 바탕에서 쓰도록 밝은 입자로 그려요.
 */
const meta = {
  title: "Shared/ParticleOrb",
  component: ParticleOrb,
  args: { radius: 13, size: 60, shape: "disc", tone: "idle", isActive: true },
  argTypes: {
    shape: { control: "radio", options: ["disc", "cloud", "mic", "arrow", "wave", "bubble", "typing"] },
    tone: { control: "radio", options: ["idle", "neutral"] },
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

/** 녹음 전의 녹음 버튼이에요. 고리 안에 붉은 원이 들어 있어요. 예: 독의 회의 녹음 버튼 */
export const Default: Story = {};

/** 올리거나 포커스해 원이 입자로 분해됐다가 마이크 모양으로 모인 상태예요. 예: 독의 회의 녹음 버튼에 마우스를 올렸을 때 */
export const Mic: Story = {
  args: { shape: "mic" },
};

/** 녹음 전의 구름 구슬이에요. 지금 독에서는 쓰지 않고 모양 비교용이에요. */
export const Cloud: Story = {
  args: { shape: "cloud" },
};

/** 독의 채팅 버튼이에요. 입자가 점 세 개가 든 말풍선으로 모여 있어요. */
export const Bubble: Story = {
  args: { radius: 13, tone: "neutral", shape: "bubble" },
};

/** 채팅 버튼에 올려 말풍선의 점들이 입력 중처럼 차례로 튀는 상태예요. */
export const Typing: Story = {
  args: { radius: 13, tone: "neutral", shape: "typing" },
};

/** 녹음 칩에 올려 파형이 「녹음 화면으로 가기」 화살표로 모인 상태예요. */
export const Arrow: Story = {
  args: { radius: 8, size: 24, width: 36, tone: "neutral", shape: "arrow" },
};

/** 녹음 버튼을 누르고 마이크와 서버가 녹음을 열기를 기다리는 상태예요. 밝은 구름이 빠르게 돌며 숨을 크게 쉬어요. 예: 독의 회의 녹음 버튼을 누른 직후 */
export const Waiting: Story = {
  args: { radius: 13, size: 60, tone: "neutral", isWaiting: true },
};

/** 녹음 중의 밝은 입자 파형이에요. 독 안(어두운 바탕)에서 채팅 말풍선과 같은 중립색이에요. 조용할 때도 숨 쉬고 목소리가 들어올 때마다 커져요. 예: 녹음 칩의 상태 표시 */
export const Recording: Story = {
  args: { radius: 8, size: 24, width: 36, tone: "neutral", shape: "wave", analyser: createFakeAnalyser() },
};

/** 다른 탭에서 녹음 중이라 소리를 읽을 수 없는 파형이에요. 숨만 쉬어요. 예: 다른 탭이 녹음 중일 때의 칩 */
export const RecordingElsewhere: Story = {
  args: { radius: 8, size: 24, width: 36, tone: "neutral", shape: "wave" },
};

/** 녹음을 잠시 멈춰 소리를 읽지 않는 상태예요. 파형이 평평한 선으로 쉬어요. 예: 일시정지한 녹음의 칩 */
export const Paused: Story = {
  args: { radius: 8, size: 24, width: 36, tone: "neutral", shape: "wave", analyser: createFakeAnalyser(), isActive: false },
};
