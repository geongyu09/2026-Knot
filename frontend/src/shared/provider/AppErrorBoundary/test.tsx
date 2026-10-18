import { ThemeProvider } from "@emotion/react";
import { AUTH_REFRESH_API_PATH } from "@api/fetch/api/v1/auth/refresh";
import { httpClient } from "@api/httpClient";
import { mockServer } from "@api/mock/server";
import { theme } from "@provider/themeProvider";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppErrorBoundary from ".";

// 피그마 ERR-03(서버 오류) 화면의 문구예요
const FALLBACK_TITLE = "잠시 문제가 생겼어요";
const FALLBACK_DESCRIPTIONS = [
  "서버에서 생긴 문제예요.",
  "잠시 후에 다시 시도해 주세요.",
];
const CONTENT_TEXT = "워크스페이스 화면";
const LOGIN_TEXT = "로그인 화면";
const OTHER_PATH = "/other";
const TEST_PATH = "/__app-error-boundary";

/** 서버 응답을 그대로 그리는 화면. 실패하면 Boundary로 넘겨요 */
function QueryContent() {
  const { data } = useQuery({
    queryKey: ["app-error-boundary"],
    queryFn: async () =>
      (await httpClient.get<{ text: string }>(TEST_PATH)).data,
    throwOnError: true,
  });

  return <p>{data?.text}</p>;
}

/** Boundary 바깥에서 주소를 바꾸는 버튼. GNB 없이 뒤로 가기로 다른 화면에 가는 것을 흉내 내요 */
function MoveToOtherButton() {
  const navigate = useNavigate();

  return (
    <button type="button" onClick={() => navigate(OTHER_PATH)}>
      다른 화면으로
    </button>
  );
}

const renderWithBoundary = (content: ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/target"]}>
          <MoveToOtherButton />
          <AppErrorBoundary>
            <Routes>
              <Route path="/target" element={content} />
              <Route path={OTHER_PATH} element={content} />
              <Route path={PATH_ROUTE.LOGIN} element={<p>{LOGIN_TEXT}</p>} />
            </Routes>
          </AppErrorBoundary>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    // React가 Boundary에 잡힌 오류를 콘솔에 남겨 테스트 출력이 지저분해지지 않게 해요
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("렌더링 오류가 나면 화면 대신 ERR-03 화면을 보여준다", () => {
    function BrokenContent(): never {
      throw new Error("렌더링 실패");
    }

    renderWithBoundary(<BrokenContent />);

    expect(
      screen.getByRole("heading", { name: FALLBACK_TITLE }),
    ).toBeInTheDocument();
    FALLBACK_DESCRIPTIONS.forEach((description) => {
      expect(screen.getByText(description)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "다시 시도" }),
    ).toBeInTheDocument();
  });

  it("다시 시도하면 페이지를 새로고침한다", () => {
    function BrokenContent(): never {
      throw new Error("렌더링 실패");
    }
    renderWithBoundary(<BrokenContent />);
    // jsdom은 새로고침하지 못해요. 새로고침 요청만 받아 두는 가짜 location으로 바꿔요
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("주소가 바뀌면 Boundary를 풀고, 넘어온 Query 오류도 함께 지워 다시 요청한다", async () => {
    let attempts = 0;
    mockServer.use(
      http.get(`*${TEST_PATH}`, () => {
        attempts += 1;
        if (attempts === 1) return new HttpResponse(null, { status: 500 });

        return HttpResponse.json({ text: CONTENT_TEXT });
      }),
    );

    renderWithBoundary(<QueryContent />);
    expect(
      await screen.findByRole("heading", { name: FALLBACK_TITLE }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다른 화면으로" }));

    expect(await screen.findByText(CONTENT_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK_TITLE)).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("401은 오류 안내를 보여주지 않고 로그인 화면으로 보낸다", async () => {
    mockServer.use(
      http.get(`*${TEST_PATH}`, () => new HttpResponse(null, { status: 401 })),
      // 토큰 재발급도 실패해 원래 요청의 401이 화면까지 와요
      http.post(
        `*${AUTH_REFRESH_API_PATH}`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    renderWithBoundary(<QueryContent />);

    expect(await screen.findByText(LOGIN_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK_TITLE)).not.toBeInTheDocument();
  });
});
