/**
 * GNB 가운데 탭(홈, 탐색, 문서)을 옮길 때의 모션 값.
 *
 * 탭 칸의 눌림과 활성 표시는 GNB가, 본문 전환은 워크스페이스 레이아웃이 써서 한 곳에 둬요.
 * 한 번의 전환이 0.25초 안에 끝나고, 본문은 8px 이하로만 움직이고, 크기는 0.96배에서 1.02배 사이에서만 바뀌게 맞췄어요.
 */

/** 등장 감속. 빠르게 출발해 부드럽게 멈춰요 */
export const TAB_ENTER_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/** 손을 뗀 탭 칸이 통 튀어 돌아오는 곡선. 0.96배에서 돌아오면 1.004배까지만 넘쳐요 */
export const TAB_POP_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/** 누르는 동안의 탭 칸 크기 */
export const TAB_PRESS_SCALE = 0.96;

/** 누를 때 작아지는 시간 */
export const TAB_PRESS_DURATION = "0.1s";

/** 손을 뗀 뒤 원래 크기로 돌아오는 시간 */
export const TAB_RELEASE_DURATION = "0.2s";

/** 활성 표시가 미끄러지고 글자색이 바뀌는 시간 */
export const TAB_INDICATOR_DURATION = "0.24s";

/** 본문이 들어오는 시간(ms). 화면 전환은 Web Animations로 걸어 ms로 둬요 */
export const TAB_SCREEN_DURATION_MS = 220;

/** 본문이 탭 방향으로 밀려 들어오기 시작하는 거리(px) */
export const TAB_SCREEN_OFFSET_PX = 8;

/** 새 본문이 처음 그려지는 불투명도. 0에서 시작하면 그 순간 배경만 보여 깜빡여 보여요 */
export const TAB_SCREEN_START_OPACITY = 0.6;
