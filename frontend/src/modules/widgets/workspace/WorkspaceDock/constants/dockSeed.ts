/** 파형 막대 수. 랜딩 녹음 장면과 같아요 */
export const SEED_WAVE_COLUMNS = 96;

/** 파형 입자 수. 좁은 화면은 그리는 비용을 줄이려고 덜 써요 */
export const SEED_PARTICLE_COUNT = { desktop: 1500, mobile: 700 } as const;

/** 이 너비(px) 미만이면 좁은 화면으로 봐요. 랜딩의 기준과 같아요 */
export const SEED_MOBILE_BREAKPOINT = 760;

/** 파형의 최대 폭(px)과 열 너비 대비 비율. 둘 중 작은 값을 써요 */
export const SEED_WAVE_MAX_WIDTH = 360;
export const SEED_WAVE_WIDTH_RATIO = 0.6;

/** 파형이 위아래로 퍼지는 최대 높이(px). 랜딩의 무대 높이 20%를 독 자리에 맞춘 값이에요 */
export const SEED_WAVE_AMPLITUDE = 34;

/** 파형 캔버스 높이(px). 독 자리 위로 이만큼 그려요 */
export const SEED_CANVAS_HEIGHT = 140;

/** 파형 가운데가 캔버스 아래에서 떨어진 거리(px) */
export const SEED_WAVE_BOTTOM = 60;

/** 포인터 피하기와 클릭 파동의 값은 랜딩과 같은 `@utils/particleMotion`의 기본값을 써요 */

/** 포인터가 독을 벗어난 뒤 파형으로 돌아가기까지 기다리는 시간(ms) */
export const SEED_CLOSE_DELAY_MS = 380;

/** 독이 열린 뒤 파형 입자가 사라지기 시작하는 시간(ms). 그동안 입자가 두 묶음으로 갈라져요 */
export const SEED_FADE_DELAY_MS = 320;

/** 대기 상태 말풍선의 글과 글자 크기(px). 입력창 안내와 같은 글이에요 */
export const SEED_BUBBLE_TEXT = "무엇이든 요청하세요";
export const SEED_BUBBLE_FONT_SIZE = { desktop: 18, mobile: 15 } as const;
export const SEED_FONT_FAMILY = '"Pretendard Variable", Pretendard, sans-serif';

/** 대기 상태 녹음 알약의 크기(px)와 가운데 점 반지름, 말풍선과의 간격 */
export const SEED_PILL = { width: 26, height: 40, dotRadius: 4, gap: 18 } as const;

/** 한 프레임이 이보다 오래 걸리는 일이 잦으면 입자 일부를 건너뛰어 가볍게 그려요(ms) */
export const SEED_SLOW_FRAME_MS = 22;
