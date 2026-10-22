import ParticleWaveform from "@composites/ParticleWaveform";

/** 파형 높이(px). 녹음한 시간 글자 높이에 맞춰요 */
const WAVEFORM_HEIGHT = 64;

interface WaveformProps {
  /** 마이크 소리를 읽는 분석기 */
  analyser: AnalyserNode | null;
  /** `false`면 일시정지라 파형을 멈추고 흐리게 그려요. */
  isActive: boolean;
}

/**
 * 녹음 시간 옆의 파형.
 *
 * 소리 크기의 흐름을 보여 주는 입자 파형이에요. 바의 남은 폭을 다 채우고, 오른쪽 끝이 지금 소리라 말하면 그 순간만 커져 왼쪽으로 흘러가요.
 * 조용하면 가는 선만 남고, 일시정지면 평평한 선으로 흐려져요. 「내 말이 지금 들리고 있다」를 보여 주는 것이 역할이라 낭독기에서는 숨겨요.
 */
export default function Waveform({ analyser, isActive }: WaveformProps) {
  return <ParticleWaveform analyser={analyser} isActive={isActive} height={WAVEFORM_HEIGHT} />;
}
