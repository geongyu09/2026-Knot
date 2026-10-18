import type { RecordingAudioMode } from "@/shared/types/recording";

/**
 * 일시정지를 뺀 녹음 시간의 상한(2시간, STT-R15).
 *
 * 이 시간에 닿으면 서버가 녹음을 끝내요. 서버 응답의 `elapsedMillis`도 이 값을 넘지 않아요.
 */
export const MAX_RECORDING_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * 새 녹음의 오디오 저장 방식. PCM 조각 녹음을 켜기(#799) 전이라 기존 WebM이에요.
 * WebM이면 시작 요청에 `audioMode`를 보내지 않아 지금과 같은 요청이 나가요.
 */
export const RECORDING_AUDIO_MODE: RecordingAudioMode = "FINAL_WEBM_V1";
