/** 파형 막대 수. 랜딩 녹음 장면과 같아요 */
export const WAVEFORM_COLUMNS = 96;

/** 넓이 1px²당 입자 수와 상한·하한. 랜딩 녹음 장면의 밀도를 녹음 바 크기에 맞춘 값이에요 */
export const WAVEFORM_PARTICLES_PER_AREA = 0.16;
export const WAVEFORM_PARTICLE_RANGE = { min: 800, max: 4000 } as const;

/** 소리가 가장 클 때 막대가 가운데에서 퍼지는 거리. 높이에 곱해요 */
export const WAVEFORM_AMPLITUDE_RATIO = 0.5;

/** 소리가 없어도 이만큼은 숨 쉬고, 목소리가 들어오면 나머지만큼 더 커져요 */
export const WAVEFORM_SILENT_SCALE = 0.35;

/** 올리면 입자가 포인터를 피하는 반지름(px). 랜딩의 95를 녹음 바 높이에 맞춰 줄였어요 */
export const WAVEFORM_POINTER_RADIUS = 48;
