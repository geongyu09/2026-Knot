import ParticleWaveform from "@composites/ParticleWaveform";

/** 파형 높이(px). 녹음한 시간 글자 높이에 맞춰요 */
const WAVEFORM_HEIGHT = 56;

interface WaveformProps {
  /** 마이크 소리를 읽는 분석기 */
  analyser: AnalyserNode | null;
  /** `false`면 일시정지라 파형을 멈추고 흐리게 그려요. */
  isActive: boolean;
}

/**
 * 녹음 시간 옆의 파형.
 *
 * 랜딩 녹음 장면 그대로의 입자 파형이에요. 바의 남은 폭을 다 채우며 숨 쉬고, 마이크 소리가 들어오면 그만큼 더 크게 퍼져요.
 * 일시정지면 숨을 멈추고 흐려져요. 녹음 중임을 보여 주는 장식이라 낭독기에서는 숨겨요.
 */
export default function Waveform({ analyser, isActive }: WaveformProps) {
  return <ParticleWaveform analyser={analyser} isActive={isActive} height={WAVEFORM_HEIGHT} />;
}
