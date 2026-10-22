import styled from "@emotion/styled";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import NewsPopover from ".";

/** GNB 오른쪽 끝처럼 버튼을 오른쪽 위에 두고, 아래로 열리는 패널이 들어갈 높이를 둬요 */
const Stage = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  height: 32rem; /* 512px */
  padding: 1rem 1.5rem; /* 16px 24px */
  background-color: ${({ theme }) => theme.neutral[50]};
`;

/**
 * Knot 서비스의 새 소식(업데이트 공지)을 여는 버튼이에요. GNB 오른쪽, 프로필 바로 왼쪽에 둘 버튼입니다.
 *
 * **동작 규칙**
 * - 버튼을 누르면 버튼 8px 아래에 폭 360px 새 소식 패널을 오른쪽 끝을 맞춰 열어요.
 * - 버튼을 다시 누르거나, 패널 바깥을 누르거나, ESC를 누르면 닫아요. 패널 안을 눌러서는 닫히지 않아요.
 * - 열려 있는 동안 버튼은 채워진 모양이에요.
 * - 버튼 이름(「새 소식과 피드백」)은 화면에 쓰지 않고 스크린리더에만 알려요.
 *
 * 지금 패널의 공지는 화면 틀을 보기 위한 임시 문구예요. 실제 릴리즈 노트와 날짜별 묶음, 빈 상태는 다음 작업에서 붙여요.
 */
const meta = {
  title: "News/NewsPopover",
  component: NewsPopover,
  parameters: {
    design: [
      {
        name: "Btn/소식과 피드백",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=4696-29512",
      },
      {
        name: "Panel/새 소식",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=4892-55263",
      },
    ],
  },
  render: () => (
    <Stage>
      <NewsPopover />
    </Stage>
  ),
} satisfies Meta<typeof NewsPopover>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 처음에는 버튼만 보여요. 눌러서 새 소식 패널을 열어 봐요 */
export const Default: Story = {};
