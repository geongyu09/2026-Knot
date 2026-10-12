import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GithubLoginButton from ".";

const GITHUB_OAUTH_PATH = /\/oauth2\/authorization\/github$/;

// jsdom은 다른 주소로 이동하지 못해요. 보내려는 주소를 받아 두는 가짜 location으로 바꿔, 어디로 몇 번 보냈는지 확인해요
let visitedUrls: string[];

beforeEach(() => {
  visitedUrls = [];
  vi.stubGlobal("location", {
    set href(url: string) {
      visitedUrls.push(url);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderButton = () => {
  render(
    <ThemeProvider theme={theme}>
      <GithubLoginButton />
    </ThemeProvider>,
  );

  // 처리 중에는 글자를 숨겨 이름으로 다시 찾을 수 없으므로, 처음에 찾은 버튼을 계속 써요
  return screen.getByRole("button", { name: "GitHub으로 시작하기" });
};

// 뒤로 가기로 돌아오면 브라우저가 떠날 때의 화면을 되살리고 pageshow를 알려요
const returnByBackButton = () =>
  act(() => {
    window.dispatchEvent(new Event("pageshow"));
  });

describe("GithubLoginButton", () => {
  it("누르면 GitHub 로그인 주소로 보낸다", () => {
    const button = renderButton();

    fireEvent.click(button);

    expect(visitedUrls).toEqual([expect.stringMatching(GITHUB_OAUTH_PATH)]);
  });

  it("누른 뒤에는 처리 중으로 바뀌어, 다시 눌러도 한 번만 보낸다", () => {
    const button = renderButton();

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(visitedUrls).toHaveLength(1);
  });

  it("뒤로 가기로 로그인 화면에 돌아오면 처리 중이 풀려 다시 누를 수 있다", () => {
    const button = renderButton();

    fireEvent.click(button);
    returnByBackButton();

    expect(button).toHaveAttribute("aria-busy", "false");
    expect(button).toBeEnabled();

    fireEvent.click(button);

    expect(visitedUrls).toHaveLength(2);
  });
});
