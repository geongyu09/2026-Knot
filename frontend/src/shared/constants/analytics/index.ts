/**
 * 사용 기록의 스크롤 깊이를 재는 요소에 다는 속성.
 *
 * 워크스페이스 화면은 창이 아니라 레이아웃의 본문(main) 안에서 스크롤되어, PostHog가 창을 재면 깊이가 늘 끝까지 본 것으로 기록돼요.
 * 그래서 본문에 이 속성을 달고 `posthog.init`의 `scroll_root_selector`로 그 요소를 재게 해요.
 */
export const ANALYTICS_SCROLL_ROOT_ATTRIBUTE = "data-analytics-scroll-root";
