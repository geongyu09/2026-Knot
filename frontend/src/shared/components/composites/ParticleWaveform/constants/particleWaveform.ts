/** 파형 막대 수. 랜딩 녹음 장면과 같아요 */
export const WAVEFORM_COLUMNS = 96;

/** 넓이 1px²당 입자 수와 상한·하한. 랜딩 녹음 장면의 밀도를 녹음 바 크기에 맞춘 값이에요 */
export const WAVEFORM_PARTICLES_PER_AREA = 0.28;
export const WAVEFORM_PARTICLE_RANGE = { min: 1200, max: 6500 } as const;

/** 소리가 가장 클 때 막대가 가운데에서 퍼지는 거리. 높이에 곱해요 */
export const WAVEFORM_AMPLITUDE_RATIO = 0.48;

/** 파형은 랜딩처럼 늘 숨 쉬고, 목소리가 들어오면 이 배율만큼 더 커져요 */
export const WAVEFORM_VOICE_GAIN = 0.5;

/** 올리면 입자가 포인터를 피하는 반지름(px). 랜딩의 95를 녹음 바 높이에 맞춰 줄였어요 */
export const WAVEFORM_POINTER_RADIUS = 48;
