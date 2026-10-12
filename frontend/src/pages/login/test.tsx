import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import LoginPage from ".";

const renderLoginPage = () => {
  const router = createMemoryRouter(
    [{ path: PATH_ROUTE.LOGIN, element: <LoginPage /> }],
    { initialEntries: [PATH_ROUTE.LOGIN] },
  );

  render(
    <ThemeProvider theme={theme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
};

describe("LoginPage", () => {
  it("제목과 GitHub 로그인 버튼, 약관 안내를 보여 준다", () => {
    renderLoginPage();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "팀의 결정을 모두의 기억으로",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "GitHub으로 시작하기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "로그인하면 서비스 이용약관과 개인정보 처리방침에 동의하게 됩니다.",
      ),
    ).toBeInTheDocument();
  });
});
