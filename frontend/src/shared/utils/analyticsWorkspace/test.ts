import type { CaptureResult } from "posthog-js";
import { afterEach, describe, expect, it } from "vitest";

import { attachAnalyticsWorkspace, setAnalyticsWorkspace } from ".";

const pageview = {
  uuid: "01a14f68-29c4-7ada-a1f8-5996005a8697",
  event: "$pageview",
  properties: { $current_url: "https://dev.knoted.kr/workspace/3" },
} as CaptureResult;

describe("attachAnalyticsWorkspace", () => {
  afterEach(() => {
    setAnalyticsWorkspace(null);
  });

  it("지금 워크스페이스가 있으면 이벤트 속성에 workspace_id를 붙이고 나머지 속성은 그대로 둔다", () => {
    setAnalyticsWorkspace(3);

    expect(attachAnalyticsWorkspace(pageview)?.properties).toEqual({
      $current_url: "https://dev.knoted.kr/workspace/3",
      workspace_id: 3,
    });
  });

  it("워크스페이스 밖이면 이벤트를 그대로 보낸다", () => {
    setAnalyticsWorkspace(3);
    setAnalyticsWorkspace(null);

    expect(attachAnalyticsWorkspace(pageview)).toBe(pageview);
  });
});
