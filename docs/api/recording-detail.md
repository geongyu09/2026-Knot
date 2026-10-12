# 녹음 단건 조회 API

이 문서는 [Issue #380](https://github.com/woowacourse-teams/2026-Knot/issues/380)의 구현 계약이다. [Issue #386](https://github.com/woowacourse-teams/2026-Knot/issues/386)의 HTTP 상태 조회 계약도 함께 다룬다. 범위는 두 Issue의 2026-10-09 범위 정리 코멘트를 따른다.
팀 Notion에 반영하거나 승인받은 문서는 아니다.

## 요청

`GET /api/v1/workspaces/{workspaceId}/recordings/{recordingId}`

인증 쿠키만 보낸다. 조회는 생존 신호가 아니다. 상태·마지막 신호·제어 권한을 바꾸지 않으며, 최초 탭이 아닌 화면에서도 호출할 수 있다.

## 성공 응답 `200 OK`

```json
{
  "status": "ENDED",
  "elapsedMillis": 600000,
  "endedAt": "2026-10-09T10:10:00Z",
  "endReason": "USER_ENDED",
  "audioUploadStatus": "COMPLETED"
}
```

| 필드 | 설명 |
| --- | --- |
| `status` | 세션 상태 `RECORDING`·`PAUSED`·`ENDED`·`DISCARDED`. 전사·문서 처리 상태가 아니다 |
| `elapsedMillis` | 일시정지를 뺀 서버 기준 녹음 시간. 진행 중이면 응답 시점까지 세며 최대 2시간(`7200000`)이다 |
| `endedAt`·`endReason` | 종료 시각과 사유(`USER_ENDED`·`CONNECTION_EXPIRED`·`MAX_DURATION`). 진행 중이면 `null`. 이 기능 이전에 종료된 녹음의 사유는 `null` |
| `audioUploadStatus` | 최종 오디오 업로드 예약이 없으면 `null`. 예약되면 `RESERVED`, 저장 확인 뒤 `COMPLETED` |

세션과 업로드 예약은 한 시점의 값이다. 진행 중 상태와 업로드 정보가 섞인 조합(`RECORDING` + `COMPLETED` 등)은 반환하지 않는다.

## 오류

| 상태 | code | 의미 |
| --- | --- | --- |
| 400 | `INVALID_WORKSPACE_ID`·`INVALID_RECORDING_DATA`·`INVALID_PARAMETER` | 잘못된 ID |
| 401 | `UNAUTHENTICATED` | 로그인 필요 |
| 403 | `WORKSPACE_ACCESS_DENIED` | Workspace 멤버가 아님. 탈퇴로 녹음이 폐기된 회원도 여기에 해당한다 |
| 403 | `RECORDING_CONTROL_DENIED` | 같은 Workspace의 다른 회원 녹음 |
| 404 | `WORKSPACE_NOT_FOUND`·`RECORDING_NOT_FOUND` | 없거나 다른 Workspace의 녹음 |

## 상태 수렴 규칙 (#386)

- 상태는 별도 구독 없이 두 HTTP 응답으로 받는다. 최초 탭은 [생존 신호](recording-heartbeat.md) 응답으로, 다른 탭·화면은 이 조회로 받는다. 두 응답의 `status`·`endedAt`·`endReason`은 같은 기준이다.
- 같은 `recordingId`에서 `ENDED`·`DISCARDED`를 한 번 본 FE는 늦게 도착한 활성 응답으로 화면을 되돌리지 않는다. 종료는 서버에서 되돌아가지 않는다.
- `403 WORKSPACE_ACCESS_DENIED`·`404`를 받으면 FE는 수집을 멈추고 임시 버퍼를 버린다.
- 기존 `GET .../recordings/current`는 바꾸지 않았다. 종료된 녹음은 여전히 `204`이므로, 종료 상태는 이 API로 확인한다.

## 이번 범위 밖

- SSE·웹소켓 같은 구독 API
- 전사·문서 생성 상태와 Job
- 새로고침 뒤 `recordingId`·음성 보존(FE 책임)
