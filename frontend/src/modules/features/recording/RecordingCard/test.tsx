import { GetMeResponseDto } from "@api/dto/auth";
import { AUTH_ME_API_PATH } from "@api/fetch/api/v1/auth/me";
import { meResponse } from "@api/mock/responses/auth";
import { mockServer } from "@api/mock/server";
import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import RecordingCard from ".";

const expected = new GetMeResponseDto(meResponse);
const GUIDE_TEXT =
  "녹음을 끝내면 대화를 주제별 문서로 정리해 문서 탭에 저장해요.";

const renderCard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RecordingCard />
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe("RecordingCard", () => {
  it("회원 정보 응답의 닉네임으로 녹음 제목을 보여준다", async () => {
    renderCard();

    expect(
      await screen.findByRole("heading", {
        name: `${expected.nickname} 님의 녹음`,
      }),
    ).toBeInTheDocument();
  });

  it("응답 전에는 제목과 안내 대신 불러오는 중으로 표시한다", () => {
    mockServer.use(
      http.get(`*${AUTH_ME_API_PATH}`, async () => {
        await delay("infinite");
        return HttpResponse.json(meResponse);
      }),
    );
    renderCard();

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText(GUIDE_TEXT)).not.toBeInTheDocument();
  });

  it("회원 정보를 못 받으면 닉네임 없이 녹음으로 보여준다", async () => {
    mockServer.use(
      http.get(
        `*${AUTH_ME_API_PATH}`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderCard();

    expect(
      await screen.findByRole("heading", { name: "녹음" }),
    ).toBeInTheDocument();
  });
});
