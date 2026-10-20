/** 현재 녹음 조회에서 화면에 보여 주는 녹음·문서 생성 진행 상태 */
export type CurrentRecordingStatus = "recording" | "paused" | "processing";

/**
 * 오디오 저장 방식. `FINAL_WEBM_V1`은 끝낸 뒤 WebM 파일 하나를 올리는 기존 방식,
 * `PCM16_CHUNKS_V1`은 녹음 중 PCM 조각을 바로 올리는 방식이에요. 시작 요청의 `audioMode`와 같은 값이에요
 */
export type RecordingAudioMode = "FINAL_WEBM_V1" | "PCM16_CHUNKS_V1";
