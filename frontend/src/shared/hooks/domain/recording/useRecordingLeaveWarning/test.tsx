import { useRecordingStore } from "@store/recordingStore";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import useRecordingLeaveWarning from ".";

/** 탭을 닫으려는 것처럼 beforeunload를 보내고, 확인 창을 띄우려 막았는지 돌려줘요 */
const tryLeave = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);

  return event.defaultPrevented;
};

describe("useRecordingLeaveWarning", () => {
  afterEach(() => {
    useRecordingStore.getState().discardRecording();
  });

  it("끝낸 녹음의 조각을 올리는 동안 탭 닫기 경고를 유지하고, 다 올리면 푼다", () => {
    renderHook(() => useRecordingLeaveWarning());
    expect(tryLeave()).toBe(false);

    act(() => useRecordingStore.setState({ isUploadingChunks: true }));
    expect(tryLeave()).toBe(true);

    act(() => useRecordingStore.setState({ isUploadingChunks: false }));
    expect(tryLeave()).toBe(false);
  });
});
