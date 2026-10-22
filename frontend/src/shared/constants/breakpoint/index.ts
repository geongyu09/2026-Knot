/**
 * 화면 폭 기준값(px). 태블릿은 768부터, 데스크톱은 1024부터예요(RESP 크기 구분).
 *
 * 데스크톱 스타일을 기본으로 두고 좁은 화면만 덮어쓰므로, 아래 조건은 모두 `max-width`예요.
 * 기준값 바로 아래까지만 잡으려고 0.02px을 빼요(소수 폭 화면에서 두 조건이 겹치지 않게).
 */
export const BREAKPOINT = {
  tablet: 768,
  desktop: 1024,
} as const;

/** `matchMedia`에 넘기는 화면 조건 */
export const SCREEN_CONDITION = {
  /** 1023 이하: 태블릿과 모바일 */
  belowDesktop: `(max-width: ${BREAKPOINT.desktop - 0.02}px)`,
  /** 767 이하: 모바일 */
  mobile: `(max-width: ${BREAKPOINT.tablet - 0.02}px)`,
} as const;

/** Emotion 스타일 안에서 쓰는 미디어 쿼리 */
export const MEDIA_QUERY = {
  /** 1023 이하: 태블릿과 모바일 */
  belowDesktop: `@media ${SCREEN_CONDITION.belowDesktop}`,
  /** 767 이하: 모바일 */
  mobile: `@media ${SCREEN_CONDITION.mobile}`,
} as const;
