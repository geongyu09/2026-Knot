# 녹음 전사 재시도 API

[Issue #639](https://github.com/woowacourse-teams/2026-Knot/issues/639)의 계약이다. 팀 Notion 동기화 전 문서다.

`POST /api/v1/workspaces/{workspaceId}/recordings/{recordingId}/transcription/retry`

본문 없이 로그인 쿠키와 `X-XSRF-TOKEN`을 보낸다. 현재 Workspace 소속인 녹음 시작자만 호출한다.
종료된 녹음, 완료되고 삭제되지 않은 오디오, 실패한 기존 시도가 필요하다.

## 성공 응답 `202 Accepted`

```json
{
  "recordingId": 10,
  "attemptId": "d0a03c18-1687-4512-8f79-1df67a8e56ef",
  "transcriptionStatus": "QUEUED"
}
```

새 UUID를 DB에 접수했다는 의미다. AI 성공을 뜻하지 않는다. [녹음 단건 조회](recording-detail.md)로 결과를 확인한다.
응답 유실 시 먼저 조회한다. 처리 중 재시도를 반복해도 새 시도를 만들지 않는다.

구간 전사 세션도 같은 요청·응답을 사용한다. 실패 구간만 새 시도로 접수하고 성공 구간은 보존한다.
`INCREMENTAL_MERGE_FAILED`는 호환되지 않는 병합 근거를 새로 만들기 위해 전체 구간을 재처리한다.
재시도로 원본 오디오 보관 기한을 연장하지 않는다. [실행·복구 계약](../operations/incremental-transcription.md)을 따른다.

## 오류

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 400 | `INVALID_WORKSPACE_ID`·`INVALID_RECORDING_DATA`·`INVALID_PARAMETER` | 식별자 형식 오류 |
| 401 | `UNAUTHENTICATED` | 로그인 필요 |
| 403 | `WORKSPACE_ACCESS_DENIED`·`RECORDING_CONTROL_DENIED`·`FORBIDDEN` | 현재 소속·녹음 소유권·CSRF 검증 실패 |
| 404 | `WORKSPACE_NOT_FOUND`·`RECORDING_NOT_FOUND`·`AUDIO_UPLOAD_NOT_FOUND` | 대상 없음 또는 다른 Workspace |
| 409 | `TRANSCRIPTION_RETRY_NOT_ALLOWED` | 시도 없음·처리 중·이미 성공 |
| 409 | `TRANSCRIPTION_DISABLED` | 전사 기능 비활성화 |
| 409 | `RECORDING_NOT_ENDED`·`RECORDING_ALREADY_DISCARDED`·`AUDIO_UPLOAD_NOT_COMPLETED` | 종료·오디오 조건 불충족 |

## 조회에 저장되는 주요 실패 코드

| 코드 | 의미 |
| --- | --- |
| `BUSY`·`AI_BUSY` | Backend 또는 AI의 실행 슬롯 사용 중 |
| `AI_NOT_READY` | AI 준비 안 됨 |
| `AI_JOB_NOT_FOUND` | AI 재시작·결과 교체 등으로 현재 시도 조회 불가 |
| `AI_TIMEOUT`·`AI_UNAVAILABLE` | 유한 통신·작업 제한 시간 초과 또는 연결 실패 |
| `AI_AUTHENTICATION_FAILED`·`AI_INVALID_RESPONSE` | 토큰 설정 또는 응답 계약 문제 |
| `SERVER_RESTARTED`·`AI_INTERRUPTED` | Backend 재시작 회수 또는 실행 중단 |
| `RESULT_STORAGE_FAILED` | 전사본·구간·문서 생성 접수 저장 실패 |
| `INCREMENTAL_WINDOW_FAILED` | 구간 처리 실패. 기존 재시도 API로 실패 구간을 재접수한다 |
| `INCREMENTAL_MERGE_FAILED` | 구간 결과의 버전·범위·완결성 불일치. 재시도 시 전체 구간을 다시 처리한다 |
| `INPUT_PREPARATION_FAILED`·`INPUT_PREPARATION_TIMEOUT`·`INPUT_PREPARATION_INVALID` | 기존 파일의 WAV 준비 실패·기한 초과·계약 불일치. 같은 API로 준비부터 새로 시도한다 |
| `RECORDING_UNAVAILABLE` | 실행 중 녹음·Workspace·오디오가 사용할 수 없게 됨 |
| `AUDIO_STORAGE_UNAVAILABLE` | 입력 객체 확인·다운로드 URL 발급 실패. 업로드 완료 때 저장한 S3 버전이 없거나 사라졌거나 형식·크기가 달라도 실패한다 |

AI 모델·다운로드의 공개 실패 코드도 보존한다. 실패 원인의 원문 메시지는 응답하지 않는다.
