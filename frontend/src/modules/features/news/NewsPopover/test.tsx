import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NewsPopover from ".";

import { TEMPORARY_NEWS } from "./constants/temporaryNews";

const BUTTON_NAME = "새 소식과 피드백";
/** 패널 머리의 설명. 패널이 열려 있는지 이 문구로 봐요 */
const PANEL_DESCRIPTION = "새로 생기거나 달라진 점을 모아 둬요";

const renderPopover = () => {
  render(
    <ThemeProvider theme={theme}>
      <NewsPopover />
    </ThemeProvider>,
  );

  return { button: screen.getByRole("button", { name: BUTTON_NAME }) };
};

describe("NewsPopover", () => {
  it("처음에는 새 소식 패널을 닫아 둔다", () => {
    const { button } = renderPopover();

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(PANEL_DESCRIPTION)).not.toBeInTheDocument();
  });

  it("버튼을 누르면 새 소식 패널을 열어 공지 목록을 보여 준다", () => {
    const { button } = renderPopover();

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(PANEL_DESCRIPTION)).toBeInTheDocument();
    TEMPORARY_NEWS.forEach(({ title, description }) => {
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
    });
  });

  it("열린 패널은 버튼을 다시 누르면 닫는다", () => {
    const { button } = renderPopover();

    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(PANEL_DESCRIPTION)).not.toBeInTheDocument();
  });

  it("열린 패널은 바깥을 누르면 닫는다", () => {
    const { button } = renderPopover();

    fireEvent.click(button);
    fireEvent.pointerDown(document.body);

    expect(screen.queryByText(PANEL_DESCRIPTION)).not.toBeInTheDocument();
  });

  it("패널 안을 눌러도 닫지 않는다", () => {
    const { button } = renderPopover();

    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByText(PANEL_DESCRIPTION));

    expect(screen.getByText(PANEL_DESCRIPTION)).toBeInTheDocument();
  });

  it("열린 패널은 ESC를 누르면 닫는다", () => {
    const { button } = renderPopover();

    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByText(PANEL_DESCRIPTION)).not.toBeInTheDocument();
  });
});
