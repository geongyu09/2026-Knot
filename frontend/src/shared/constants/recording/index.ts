import type { RecordingAudioMode } from "@/shared/types/recording";

/**
 * 일시정지를 뺀 녹음 시간의 상한(2시간, STT-R15).
 *
 * 이 시간에 닿으면 서버가 녹음을 끝내요. 서버 응답의 `elapsedMillis`도 이 값을 넘지 않아요.
 */
export const MAX_RECORDING_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * 새 녹음의 오디오 저장 방식. PCM이면 시작 요청에 `audioMode`를 실어 조각 녹음을 켜요.
 * 운영에서 끄는 일은 FE 재배포가 아니라 BE 설정(`recording.audio-chunks.enabled=false`)으로 하고,
 * 그러면 FE는 거절(409 `AUDIO_MODE_DISABLED`)을 받아 WebM으로 돌아가요.
 */
export const RECORDING_AUDIO_MODE: RecordingAudioMode = "PCM16_CHUNKS_V1";
