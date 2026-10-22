/** 그림 무대 크기(px). 정리 화면 맨 위에 놓여요 */
export const WRITING_STAGE_WIDTH = 192;
export const WRITING_STAGE_HEIGHT = 128;

/** 입자 수. 문서 세 장의 윤곽과 글줄을 채울 만큼 둬요 */
export const WRITING_PARTICLE_COUNT = 1100;

/** 파형 막대 수와 폭(px), 위아래로 퍼지는 최대 높이(px) */
export const WRITING_WAVE_COLUMNS = 56;
export const WRITING_WAVE_WIDTH = 156;
export const WRITING_WAVE_AMPLITUDE = 34;

/**
 * 한 바퀴의 흐름(ms). 파형이 숨 쉬다가 → 문서 세 장으로 갈라지고 → 입자 펜이 글줄을 써 내려간 뒤 → 잠깐 머물렀다가 → 다시 파형으로 모여요.
 * 펜은 문서마다 조금씩 늦게 출발해 세 장이 한꺼번에 움직이지 않아요.
 */
export const WRITING_TIMELINE = {
  split: 1300,
  write: 2100,
  lineDuration: 620,
  docStagger: 260,
  gather: 5600,
  cycle: 6500,
} as const;

/** 문서 한 장의 크기(px)와 모서리 */
export const WRITING_DOC = { width: 46, height: 60, radius: 7 } as const;

/** 문서 세 장의 자리(무대 가운데 기준 px)와 기울기(rad). 가운데 장이 조금 위에 있어 펼친 카드처럼 보여요 */
export const WRITING_DOC_LAYOUT = [
  { x: -53, y: 6, rotation: -0.13 },
  { x: 0, y: -3, rotation: 0 },
  { x: 53, y: 6, rotation: 0.13 },
] as const;

/** 문서 안 글줄의 세로 자리(문서 가운데 기준 px)와 길이(안쪽 폭 대비). `writing.svg`의 세 줄과 같은 비율이에요 */
export const WRITING_LINES = [
  { y: -13, length: 0.82 },
  { y: -2, length: 0.66 },
  { y: 9, length: 0.46 },
] as const;

/** 윤곽을 맡는 입자 비율. 나머지는 글줄을 맡아요 */
export const WRITING_OUTLINE_SHARE = 0.5;
