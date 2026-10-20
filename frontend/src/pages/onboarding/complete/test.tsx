import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readAuthReturnPath, saveAuthReturnPath } from "@utils/authReturnPath";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import OnboardingCompletePage from ".";

const NICKNAME = "노티드";
/** 로그인 전 초대 참여가 401로 끝나며 기억해 둔 복귀 주소 */
const INVITE_PATH = "/invite/X35D3S";

const renderPage = () => {
  const router = createMemoryRouter(
    [
      { path: PATH_ROUTE.ONBOARDING, element: <p>닉네임 입력</p> },
      {
        path: PATH_ROUTE.ONBOARDING_COMPLETE,
        element: <OnboardingCompletePage />,
      },
      { path: PATH_ROUTE.WORKSPACE, element: <p>워크스페이스 생성 및 참여</p> },
      { path: PATH_ROUTE.INVITE, element: <p>초대 링크</p> },
    ],
    {
      initialEntries: [
        {
          pathname: PATH_ROUTE.ONBOARDING_COMPLETE,
          state: { nickname: NICKNAME },
        },
      ],
    },
  );

  render(
    <ThemeProvider theme={theme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );

  return { router };
};

const clickStart = () =>
  fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

describe("OnboardingCompletePage", () => {
  afterEach(() => sessionStorage.clear());

  it("시작하기를 누르면 워크스페이스 생성 및 참여 화면으로 이동한다", async () => {
    const { router } = renderPage();

    clickStart();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATH_ROUTE.WORKSPACE);
    });
  });

  it("기억해 둔 복귀 주소가 있으면 시작하기가 그 주소로 이동하고 저장값을 지운다", async () => {
    saveAuthReturnPath(INVITE_PATH);
    const { router } = renderPage();

    clickStart();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(INVITE_PATH);
    });
    expect(readAuthReturnPath()).toBeUndefined();
  });
});
