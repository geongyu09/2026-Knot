/** 파형 막대 수. 랜딩 녹음 장면과 같아요 */
export const SEED_WAVE_COLUMNS = 96;

/** 파형 입자 수. 좁은 화면은 그리는 비용을 줄이려고 덜 써요 */
export const SEED_PARTICLE_COUNT = { desktop: 2600, mobile: 1100 } as const;

/** 이 너비(px) 미만이면 좁은 화면으로 봐요. 랜딩의 기준과 같아요 */
export const SEED_MOBILE_BREAKPOINT = 760;

/** 파형의 최대 폭(px)과 열 너비 대비 비율. 둘 중 작은 값을 써요 */
export const SEED_WAVE_MAX_WIDTH = 360;
export const SEED_WAVE_WIDTH_RATIO = 0.6;

/** 파형이 위아래로 퍼지는 최대 높이(px). 랜딩의 무대 높이 20%를 독 자리에 맞춘 값이에요 */
export const SEED_WAVE_AMPLITUDE = 22;

/** 파형이 알약 밖으로 나가지 않게 가운데에서 위아래로 이만큼(px)까지만 퍼져요. 큰 소리는 잘리지 않고 부드럽게 눌려요 */
export const SEED_WAVE_LIMIT = 24;

/** 파형과 시간을 담는 알약의 높이(px). 독과 같은 60px이라 올리면 독으로 자연스럽게 이어져요 */
export const SEED_PILL_HEIGHT = 60;

/** 캔버스가 독 아래로 더 내려가는 거리(px). 알약 윤곽과 떠다니는 흔들림이 잘리지 않게 해요 */
export const SEED_CANVAS_OVERFLOW = 20;

/** 입자 캔버스 높이(px). 독 자리 위아래로 넉넉히 그려요 */
export const SEED_CANVAS_HEIGHT = 160;

/** 파형 가운데가 캔버스 아래에서 떨어진 거리(px). 접힌 독의 세로 가운데와 같아요 */
export const SEED_WAVE_BOTTOM = 30 + SEED_CANVAS_OVERFLOW;

/** 포인터 피하기와 클릭 파동의 값은 랜딩과 같은 `@utils/particleMotion`의 기본값을 써요 */

/** 포인터가 독을 벗어난 뒤 파형으로 돌아가기까지 기다리는 시간(ms) */
export const SEED_CLOSE_DELAY_MS = 380;

/** 독이 열린 뒤 입자가 사라지기 시작하는 시간(ms). 진짜 독이 나타나는 동안 잠깐만 겹쳐요 */
export const SEED_FADE_DELAY_MS = 140;

/** 파형이 독 모양으로 모일 때 채팅 아이콘 한 변(px)과 녹음 칩 자리 구슬 반지름(px). 열린 독의 아이콘·구슬과 같은 크기예요 */
export const SEED_ICON_SIZE = 32;
export const SEED_ORB_RADIUS = 13;

/** 파형은 랜딩처럼 늘 숨 쉬고, 목소리가 들어오면 이 배율만큼 더 커져요. 녹음 바 파형과 같아요 */
export const SEED_WAVE_VOICE_GAIN = 0.5;

/** 한 프레임이 이보다 오래 걸리는 일이 잦으면 입자 일부를 건너뛰어 가볍게 그려요(ms) */
export const SEED_SLOW_FRAME_MS = 22;
