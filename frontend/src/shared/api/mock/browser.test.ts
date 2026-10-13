import { focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reactivateMockWorkerOnFocus } from "./browser";

// browser.ts는 불러올 때 setupWorker를 부르는데, vitest(jsdom)에는 서비스 워커가 없어 그대로는 불러오지 못해요
vi.mock("msw/browser", () => ({ setupWorker: () => ({}) }));

interface StubServiceWorkerParams {
  /** 워커가 이 페이지를 맡고 있는지. 강력 새로고침 직후에는 맡고 있지 않아요 */
  hasController: boolean;
}

/** jsdom에 없는 `navigator.serviceWorker`를 메시지를 주고받을 수 있는 가짜로 채워요 */
const stubServiceWorker = ({ hasController }: StubServiceWorkerParams) => {
  const serviceWorker = new EventTarget();
  const postMessage = vi.fn();

  Object.defineProperty(serviceWorker, "controller", {
    value: hasController ? { postMessage } : null,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorker,
  });

  const replyFromWorker = (type: string) => {
    serviceWorker.dispatchEvent(
      new MessageEvent("message", { data: { type } }),
    );
  };

  return { postMessage, replyFromWorker };
};

const changeVisibility = (visibilityState: DocumentVisibilityState) => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(visibilityState);
  window.dispatchEvent(new Event("visibilitychange"));
};

describe("reactivateMockWorkerOnFocus", () => {
  // 창 포커스 다시 조회가 나가는 순간을 봐요. QueryClient도 이 알림을 받아 다시 조회해요
  const handleFocusChange = vi.fn();
  let unsubscribe: () => void;

  beforeEach(() => {
    reactivateMockWorkerOnFocus();
    unsubscribe = focusManager.subscribe(handleFocusChange);
  });

  afterEach(() => {
    unsubscribe();
    handleFocusChange.mockClear();
    vi.restoreAllMocks();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("창이 다시 보이면 워커를 다시 활성화하고, 워커가 답한 뒤에 다시 조회를 내보낸다", async () => {
    const { postMessage, replyFromWorker } = stubServiceWorker({
      hasController: true,
    });

    changeVisibility("visible");

    expect(postMessage).toHaveBeenCalledExactlyOnceWith("MOCK_ACTIVATE");
    expect(handleFocusChange).not.toHaveBeenCalled();

    replyFromWorker("MOCKING_ENABLED");

    await vi.waitFor(() => {
      expect(handleFocusChange).toHaveBeenCalledExactlyOnceWith(true);
    });
  });

  it("워커의 다른 메시지에는 다시 조회를 내보내지 않는다", async () => {
    vi.useFakeTimers();
    const { replyFromWorker } = stubServiceWorker({ hasController: true });

    changeVisibility("visible");
    replyFromWorker("KEEPALIVE_RESPONSE");
    await vi.advanceTimersByTimeAsync(0);

    expect(handleFocusChange).not.toHaveBeenCalled();
  });

  it("워커가 정한 시간 안에 답하지 않으면 기다리지 않고 다시 조회를 내보낸다", async () => {
    vi.useFakeTimers();
    stubServiceWorker({ hasController: true });

    changeVisibility("visible");
    await vi.advanceTimersByTimeAsync(999);

    expect(handleFocusChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(handleFocusChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("워커가 이 페이지를 맡고 있지 않으면 기다리지 않고 다시 조회를 내보낸다", async () => {
    const { postMessage } = stubServiceWorker({ hasController: false });

    changeVisibility("visible");

    await vi.waitFor(() => {
      expect(handleFocusChange).toHaveBeenCalledExactlyOnceWith(true);
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("창이 가려질 때는 워커를 깨우지 않는다", () => {
    const { postMessage } = stubServiceWorker({ hasController: true });

    changeVisibility("hidden");

    expect(postMessage).not.toHaveBeenCalled();
    expect(handleFocusChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
