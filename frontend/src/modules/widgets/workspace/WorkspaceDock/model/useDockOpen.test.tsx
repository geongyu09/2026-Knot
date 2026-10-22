import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEED_CLOSE_DELAY_MS } from "../constants/dockSeed";
import { useDockOpen } from "./useDockOpen";

/** 녹음이 이어지는 동안 독이 어느 화면에 있는지. 탐색(`isExpandedByScreen`)에서는 늘 펼쳐 있어요 */
const renderDockOpen = (initial: {
  isExpanded: boolean;
  isExpandedByScreen: boolean;
}) =>
  renderHook(
    (props: { isExpanded: boolean; isExpandedByScreen: boolean }) =>
      useDockOpen({
        stageRef: { current: null },
        isExpanded: props.isExpanded,
        isExpandedByScreen: props.isExpandedByScreen,
        hasMessage: false,
        hasWaveform: true,
      }),
    { initialProps: initial },
  );

describe("useDockOpen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom에는 캔버스가 없어요. 파형을 그릴 수 있는 브라우저로 둬요
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("사용자가 펼친 독을 접으면 접힘 모션이 끝난 뒤에 파형으로 돌아간다", () => {
    const { result, rerender } = renderDockOpen({
      isExpanded: true,
      isExpandedByScreen: false,
    });

    rerender({ isExpanded: false, isExpandedByScreen: false });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isClosedByScreen).toBe(false);

    act(() => vi.advanceTimersByTime(360 + SEED_CLOSE_DELAY_MS));

    expect(result.current.isOpen).toBe(false);
  });

  it("늘 펼쳐 두는 탐색 화면을 떠나면 기다리지 않고 바로 파형이 된다", () => {
    const { result, rerender } = renderDockOpen({
      isExpanded: true,
      isExpandedByScreen: true,
    });

    rerender({ isExpanded: false, isExpandedByScreen: false });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isClosedByScreen).toBe(true);
  });

  it("탐색 화면을 떠난 뒤 다시 올리면 평소대로 모션과 함께 열린다", () => {
    const { result, rerender } = renderDockOpen({
      isExpanded: true,
      isExpandedByScreen: true,
    });
    rerender({ isExpanded: false, isExpandedByScreen: false });

    act(() => result.current.enter());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isClosedByScreen).toBe(false);
  });
});
