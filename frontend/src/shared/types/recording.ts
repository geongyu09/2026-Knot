/**
 * 현재 녹음 조회에서 화면에 보여 주는 녹음 상태.
 * `organizing`은 녹음을 끝낸 뒤 문서를 정리하는 중이에요. 정리 화면과 같은 이름(`getRecordingDocumentsStatus`)을 써요
 */
export type CurrentRecordingStatus = "recording" | "paused" | "organizing";

/**
 * 오디오 저장 방식. `FINAL_WEBM_V1`은 끝낸 뒤 WebM 파일 하나를 올리는 기존 방식,
 * `PCM16_CHUNKS_V1`은 녹음 중 PCM 조각을 바로 올리는 방식이에요. 시작 요청의 `audioMode`와 같은 값이에요
 */
export type RecordingAudioMode = "FINAL_WEBM_V1" | "PCM16_CHUNKS_V1";

/** 브라우저가 알려 주는 마이크 권한 상태. 마이크 권한을 조회할 수 없는 브라우저면 `unsupported`예요 */
export type MicrophonePermission = PermissionState | "unsupported";
