/**
 * 말소리의 RMS는 0.2 안팎이라 그대로 쓰면 막대가 낮게만 움직여요.
 * 보통 크기로 말할 때 막대가 꽉 차도록 이만큼 키워요.
 */
const LEVEL_GAIN = 5;

/**
 * 마이크 샘플(-1~1 진폭) 묶음의 소리 크기를 0~1로 돌려줘요.
 *
 * 진폭의 제곱 평균의 제곱근(RMS)을 써서 순간적인 튐보다 묶음 전체의 크기를 봐요.
 * 녹음 파형, 독의 구슬과 입자가 모두 이 값으로 목소리를 따라요.
 */
export const measureAudioLevel = (samples: Float32Array) => {
  if (samples.length === 0) return 0;

  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;

  const rms = Math.sqrt(sumOfSquares / samples.length);

  return Math.min(1, rms * LEVEL_GAIN);
};

/** 분석기에서 지금 소리 묶음을 읽어 크기(0~1)를 돌려줘요. */
export const measureAnalyserLevel = (analyser: AnalyserNode) => {
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  return measureAudioLevel(samples);
};
