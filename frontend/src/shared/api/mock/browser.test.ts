import { focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reactivateMockWorkerOnFocus } from "./browser";

// browser.ts는 불러올 때 setupWorker를 부르는데, vitest(jsdom)에는 서비스 워커가 없어 그대로는 불러오지 못해요
vi.mock("msw/browser", () => ({ setupWorker: () => ({}) }));

// browser.ts의 MOCK_WORKER_REPLY_TIMEOUT_MS와 같은 값이에요
const MOCK_WORKER_REPLY_TIMEOUT_MS = 1000;

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

/** 시간은 흘리지 않고 밀려 있는 프로미스만 끝내요. 시간이 다 돼서 생긴 일과 구분하려는 거예요 */
const flushPromises = () => vi.advanceTimersByTimeAsync(0);

describe("reactivateMockWorkerOnFocus", () => {
  // 창 포커스 다시 조회가 나가는 순간을 봐요. QueryClient도 이 알림을 받아 다시 조회해요
  const handleFocusChange = vi.fn();
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    reactivateMockWorkerOnFocus();
    unsubscribe = focusManager.subscribe(handleFocusChange);
  });

  afterEach(() => {
    unsubscribe();
    // focusManager가 창이 보이는지를 기억하므로, 다음 테스트에 남지 않게 되돌려요
    focusManager.setFocused(undefined);
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
    await flushPromises();

    expect(postMessage).toHaveBeenCalledExactlyOnceWith("MOCK_ACTIVATE");
    expect(handleFocusChange).not.toHaveBeenCalled();

    replyFromWorker("MOCKING_ENABLED");
    await flushPromises();

    expect(handleFocusChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("워커가 답하기 전에는 창이 보이지 않는 것으로 둬, 일정 간격 조회가 먼저 나가지 않게 한다", async () => {
    const { replyFromWorker } = stubServiceWorker({ hasController: true });

    changeVisibility("hidden");
    changeVisibility("visible");
    await flushPromises();

    // 일정 간격 조회는 알림을 기다리지 않고 이 값만 보고 나가요
    expect(focusManager.isFocused()).toBe(false);

    replyFromWorker("MOCKING_ENABLED");
    await flushPromises();

    expect(focusManager.isFocused()).toBe(true);
  });

  it("워커의 답을 기다리는 사이 창이 다시 가려지면 다시 조회를 내보내지 않는다", async () => {
    const { replyFromWorker } = stubServiceWorker({ hasController: true });

    changeVisibility("visible");
    changeVisibility("hidden");
    replyFromWorker("MOCKING_ENABLED");
    await flushPromises();

    expect(handleFocusChange).not.toHaveBeenCalledWith(true);
    expect(focusManager.isFocused()).toBe(false);
  });

  it("워커의 다른 메시지에는 다시 조회를 내보내지 않는다", async () => {
    const { replyFromWorker } = stubServiceWorker({ hasController: true });

    changeVisibility("visible");
    replyFromWorker("KEEPALIVE_RESPONSE");
    await flushPromises();

    expect(handleFocusChange).not.toHaveBeenCalled();
  });

  it("워커가 정한 시간 안에 답하지 않으면 기다리지 않고 다시 조회를 내보낸다", async () => {
    stubServiceWorker({ hasController: true });

    changeVisibility("visible");
    await vi.advanceTimersByTimeAsync(MOCK_WORKER_REPLY_TIMEOUT_MS - 1);

    expect(handleFocusChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(handleFocusChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("워커가 이 페이지를 맡고 있지 않으면 기다리지 않고 다시 조회를 내보낸다", async () => {
    stubServiceWorker({ hasController: false });

    changeVisibility("visible");
    await flushPromises();

    expect(handleFocusChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("창이 가려질 때는 워커를 깨우지 않는다", () => {
    const { postMessage } = stubServiceWorker({ hasController: true });

    changeVisibility("hidden");

    expect(postMessage).not.toHaveBeenCalled();
    expect(handleFocusChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
