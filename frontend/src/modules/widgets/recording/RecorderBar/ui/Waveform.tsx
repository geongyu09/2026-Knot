import ParticleWaveform from "@composites/ParticleWaveform";
import styled from "@emotion/styled";

/** 파형을 담는 알약의 높이(px). 독과 같은 60px이에요 */
const PILL_HEIGHT = 60;

/** 파형 높이(px). 알약 안에서 위아래 여백을 조금 남겨요 */
const WAVEFORM_HEIGHT = 48;

interface WaveformProps {
  /** 마이크 소리를 읽는 분석기 */
  analyser: AnalyserNode | null;
  /** `false`면 일시정지라 파형을 멈추고 흐리게 그려요. */
  isActive: boolean;
}

/**
 * 녹음 시간 옆의 파형.
 *
 * 랜딩 녹음 장면 그대로의 입자 파형이에요. 독과 같은 Neutral 800 알약 안에서 바의 남은 폭을 다 채우며 숨 쉬고,
 * 마이크 소리가 들어오면 그만큼 더 크게 퍼져요. 접힌 독의 파형, 독 안의 녹음 칩과 같은 색이라 어디서 봐도 같은 녹음이에요.
 * 일시정지면 숨을 멈추고 흐려져요. 녹음 중임을 보여 주는 장식이라 낭독기에서는 숨겨요.
 */
export default function Waveform({ analyser, isActive }: WaveformProps) {
  return (
    <Pill>
      <ParticleWaveform analyser={analyser} isActive={isActive} height={WAVEFORM_HEIGHT} />
    </Pill>
  );
}

const Pill = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  height: ${PILL_HEIGHT / 16}rem;
  padding: 0 1rem; /* 16px */
  border-radius: 6.25rem; /* 100px */
  background-color: ${({ theme }) => theme.neutral[800]};
`;
