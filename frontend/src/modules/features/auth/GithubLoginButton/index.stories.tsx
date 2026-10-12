import type { Meta, StoryObj } from "@storybook/react-webpack5";

import GithubLoginButton from ".";

/**
 * GitHub 계정으로 로그인을 시작하는 버튼이에요. 로그인 화면(`/login`)의 가운데에 하나만 둡니다.
 *
 * **동작 규칙**
 * - 누르면 앱 안에서 화면을 바꾸는 것이 아니라 **페이지를 통째로** GitHub 로그인 페이지로 옮겨요.
 *   이 주소는 화면에 그릴 응답을 주는 API가 아니라 GitHub으로 보내는 리다이렉트라서,
 *   API처럼 부르면 GitHub 도메인에서 막히고 로그인 쿠키도 제대로 심기지 않기 때문이에요.
 * - 누른 뒤 GitHub으로 넘어갈 때까지는 처리 중이에요. 글자 자리에 스피너가 돌고 다시 누를 수 없어서, 로그인 요청이 겹치지 않아요.
 *   처리 중 모양은 `Shared/Button`의 `Loading` 스토리와 같아요. 이 버튼은 누르면 실제로 페이지가 넘어가서, 처리 중 스토리를 따로 두지 않았어요.
 * - GitHub 화면에서 뒤로 가기로 돌아오면 처리 중이 풀려 다시 누를 수 있어요.
 * - 이동 뒤의 흐름은 백엔드가 정해요. 기존 회원은 접근 토큰 쿠키를 받고,
 *   신규 사용자는 온보딩 토큰 쿠키를 받아 닉네임 입력 화면(`/onboarding`)으로 돌아옵니다.
 * - 서버가 허용한 출처에서만 동작해요. 스토리북과 `localhost`에서는 눌러도 로그인되지 않으니 배포된 주소에서 확인해야 합니다.
 * - 로그인이 실패해 돌아오면 버튼 바로 위에 `Auth/OAuthErrorNotice`가 실패 문구를 띄우고, 이 버튼으로 다시 시도해요.
 */
const meta = {
  title: "Auth/GithubLoginButton",
  component: GithubLoginButton,
  parameters: {
    design: [
      {
        name: "로그인/기본",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1788-4727",
      },
      {
        name: "로그인/처리 중",
        type: "figma",
        url: "https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=3812-39720",
      },
    ],
  },
  decorators: [
    // 로그인 화면의 버튼 영역 너비(최대 360px)에 맞춰 가로를 꽉 채워요
    (Story) => (
      <div style={{ width: "22.5rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GithubLoginButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 로그인 화면에서 보이는 모습이에요. 버튼 영역의 가로를 꽉 채웁니다. */
export const Default: Story = {};
