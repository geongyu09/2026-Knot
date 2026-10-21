import ParticleWaveform from "@composites/ParticleWaveform";

import {
  WAVEFORM_COLUMN_WIDTH,
  WAVEFORM_MAX_BAR_HEIGHT,
  WAVEFORM_MIN_BAR_HEIGHT,
  WAVEFORM_PENDING_BAR_COUNT,
} from "../constants/waveform";
import { useWaveformLevels } from "../model/useWaveformLevels";

interface WaveformProps {
  /** 마이크 소리를 읽는 분석기 */
  analyser: AnalyserNode | null;
  /** `false`면 일시정지라 파형을 멈추고 모두 흐리게 그려요. */
  isActive: boolean;
}

/**
 * 녹음 시간 옆의 파형.
 *
 * 랜딩 녹음 장면처럼 입자로 그려요. 마이크에 들어오는 소리 크기만큼 입자가 세로로 퍼지고,
 * 새 소리가 오른쪽 끝에서 들어와 왼쪽으로 흘러가요.
 * 끝의 몇 개는 아직 들어오지 않은 소리 자리라 흐리게 두고, 일시정지면 전부 흐려요.
 * 녹음 중임을 보여 주는 장식이라 낭독기에서는 숨겨요.
 */
export default function Waveform({ analyser, isActive }: WaveformProps) {
  const { levels } = useWaveformLevels({ analyser, isActive });

  return (
    <ParticleWaveform
      levels={levels}
      pendingCount={WAVEFORM_PENDING_BAR_COUNT}
      isActive={isActive}
      height={WAVEFORM_MAX_BAR_HEIGHT}
      minHeight={WAVEFORM_MIN_BAR_HEIGHT}
      columnWidth={WAVEFORM_COLUMN_WIDTH}
    />
  );
}
