import { RELEASE_NOTES } from "@constants/releaseNote";
import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import type { ReleaseNote } from "@/shared/types/releaseNote";

import NewsPopover from ".";

import { formatReleaseDate } from "./utils/formatReleaseDate";

const BUTTON_NAME = "새 소식과 피드백";
/** 패널 머리의 설명. 패널이 열려 있는지 이 문구로 봐요 */
const PANEL_DESCRIPTION = "새로 생기거나 달라진 점을 모아 둬요";
const WORKSPACE_ID = "1";

const ALL_ITEMS = RELEASE_NOTES.flatMap(({ items }) => items);

const renderPopover = (notes?: ReleaseNote[]) => {
  const router = createMemoryRouter(
    [
      {
        path: PATH_ROUTE.WORKSPACE_HOME,
        element: <NewsPopover notes={notes} />,
      },
      { path: PATH_ROUTE.CHAT, element: null },
    ],
    {
      initialEntries: [
        getRouterPath({
          routeKey: "WORKSPACE_HOME",
          params: { workspaceId: WORKSPACE_ID },
        }),
      ],
    },
  );

  render(
    <ThemeProvider theme={theme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );

  return { router, button: screen.getByRole("button", { name: BUTTON_NAME }) };
};

/** 버튼을 눌러 패널을 연 상태로 그려요 */
const renderOpenPanel = (notes?: ReleaseNote[]) => {
  const rendered = renderPopover(notes);
  fireEvent.click(rendered.button);

  return rendered;
};

describe("NewsPopover", () => {
  describe("여닫기", () => {
    it("처음에는 새 소식 패널을 닫아 둔다", () => {
      const { button } = renderPopover();

      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText(PANEL_DESCRIPTION)).not.toBeInTheDocument();
    });

    it("버튼을 누르면 새 소식 패널을 연다", () => {
      const { button } = renderOpenPanel();

      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText(PANEL_DESCRIPTION)).toBeInTheDocument();
    });

    it("열린 패널은 버튼을 다시 누르면 닫는다", () => {
      const { button } = renderOpenPanel();

      fireEvent.click(button);

      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText(PANEL_DESCRIPTION)).not.toBeInTheDocument();
    });

    it("열린 패널은 바깥을 누르면 닫는다", () => {
      renderOpenPanel();

      fireEvent.pointerDown(document.body);

      expect(screen.queryByText(PANEL_DESCRIPTION)).not.toBeInTheDocument();
    });

    it("패널 안을 눌러도 닫지 않는다", () => {
      renderOpenPanel();

      fireEvent.pointerDown(screen.getByText(PANEL_DESCRIPTION));

      expect(screen.getByText(PANEL_DESCRIPTION)).toBeInTheDocument();
    });

    it("열린 패널은 ESC를 누르면 닫는다", () => {
      renderOpenPanel();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByText(PANEL_DESCRIPTION)).not.toBeInTheDocument();
    });
  });

  describe("노트 목록", () => {
    it("노트를 배포 날짜별로 최신부터 묶어 보여 준다", () => {
      renderOpenPanel();

      const dateHeadings = screen.getAllByRole("heading", { level: 3 });

      expect(dateHeadings.map(({ textContent }) => textContent)).toEqual(
        RELEASE_NOTES.map(({ releasedAt }) => formatReleaseDate(releasedAt)),
      );
    });

    it("같은 날 배포한 노트는 한 날짜 묶음에 모아 보여 준다", () => {
      const sameDayNotes: ReleaseNote[] = [
        {
          id: "v1.0.1",
          releasedAt: "2026-11-02",
          items: [{ title: "나중 릴리즈 항목", description: "설명" }],
        },
        {
          id: "v1.0.0",
          releasedAt: "2026-11-02",
          items: [{ title: "먼저 릴리즈 항목", description: "설명" }],
        },
      ];
      renderOpenPanel(sameDayNotes);

      const [dateGroup, ...rest] = screen.getAllByRole("heading", {
        level: 3,
      });

      expect(rest).toHaveLength(0);
      expect(dateGroup).toHaveTextContent("11월 2일");
      expect(
        screen.getAllByRole("listitem").map(({ textContent }) => textContent),
      ).toEqual(["나중 릴리즈 항목설명", "먼저 릴리즈 항목설명"]);
    });

    it("항목마다 제목과 설명을 보여 준다", () => {
      renderOpenPanel();

      ALL_ITEMS.forEach(({ title, description }) => {
        expect(screen.getByText(title)).toBeInTheDocument();
        expect(screen.getByText(description)).toBeInTheDocument();
      });
    });

    it("피드백으로 고친 항목에만 「피드백 덕분에 바뀌었어요」 칩을 붙인다", () => {
      renderOpenPanel();

      expect(screen.queryAllByText("피드백 덕분에 바뀌었어요")).toHaveLength(
        ALL_ITEMS.filter(({ isFromFeedback }) => isFromFeedback).length,
      );
    });

    it("이미지와 「바로 가보기」는 있는 항목에만 보여 준다", () => {
      renderOpenPanel([
        {
          id: "v1.0.0",
          releasedAt: "2026-11-02",
          items: [
            {
              title: "이미지와 바로 가보기가 있는 항목",
              description: "설명",
              image: "/news.png",
              link: "CHAT",
            },
            { title: "글만 있는 항목", description: "설명" },
          ],
        },
      ]);

      expect(document.querySelectorAll("img")).toHaveLength(1);
      expect(screen.getAllByRole("link", { name: "바로 가보기" })).toHaveLength(
        1,
      );
    });

    it("「바로 가보기」를 누르면 지금 워크스페이스의 그 화면으로 옮긴다", () => {
      const { router } = renderOpenPanel([
        {
          id: "v1.0.0",
          releasedAt: "2026-11-02",
          items: [{ title: "탐색", description: "설명", link: "CHAT" }],
        },
      ]);

      fireEvent.click(screen.getByRole("link", { name: "바로 가보기" }));

      expect(router.state.location.pathname).toBe(
        getRouterPath({
          routeKey: "CHAT",
          params: { workspaceId: WORKSPACE_ID },
        }),
      );
    });

    it("노트가 없으면 빈 상태를 보여 준다", () => {
      renderOpenPanel([]);

      expect(screen.getByText("아직 새 소식이 없어요")).toBeInTheDocument();
      expect(
        screen.getByText("바뀐 점이 생기면 여기에 모아 둘게요"),
      ).toBeInTheDocument();
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    });
  });
});
