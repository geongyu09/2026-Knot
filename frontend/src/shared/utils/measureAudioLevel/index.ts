/**
 * 소리 크기를 데시벨로 재서 0~1로 바꿔요.
 *
 * 말소리의 진폭(RMS)은 0.01~0.3 사이를 오가서 그대로 쓰면 보통 크기로 말해도 낮게만 움직여요.
 * 사람 귀처럼 데시벨로 보면 조용한 방의 잡음(약 -55dB 아래)은 0이고, 보통 크기의 말(-30~-20dB)이 60~80%,
 * 큰 소리(-12dB 위)가 100%예요. 그래서 조용하면 파형이 평평하고 말하면 또렷하게 커져요.
 */
const SILENCE_DB = -55;
const FULL_DB = -12;

/**
 * 마이크 샘플(-1~1 진폭) 묶음의 소리 크기를 0~1로 돌려줘요.
 *
 * 진폭의 제곱 평균의 제곱근(RMS)을 데시벨로 바꿔 잡음 바닥과 큰 소리 사이에 펴요.
 * 녹음 파형, 독의 구슬과 입자가 모두 이 값으로 목소리를 따라요.
 */
export const measureAudioLevel = (samples: Float32Array) => {
  if (samples.length === 0) return 0;

  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;

  const rms = Math.sqrt(sumOfSquares / samples.length);
  if (rms <= 0) return 0;

  const decibels = 20 * Math.log10(rms);
  return Math.max(
    0,
    Math.min(1, (decibels - SILENCE_DB) / (FULL_DB - SILENCE_DB)),
  );
};

/** 분석기에서 지금 소리 묶음을 읽어 크기(0~1)를 돌려줘요. */
export const measureAnalyserLevel = (analyser: AnalyserNode) => {
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  return measureAudioLevel(samples);
};
