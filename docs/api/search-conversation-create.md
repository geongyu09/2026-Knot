# 탐색 첫 질문 접수 API

`POST /api/v1/workspaces/{workspaceId}/search/conversations`

확인: 2026-10-11. 로컬 구현·검증 범위는 질문 접수, 영속 생성 작업, 부분 본문 저장과 SSE 전송이다.
실제 검색 전략·색인 준비 상태·공급자 스트리밍 adapter는 미연결이다. 기본 worker 비활성 설정의 신규 요청은 접수 전에
500 ANSWER_GENERATION_UNAVAILABLE로 거절된다. 테스트에서는 Mockito adapter와 실제 PostgreSQL·HTTP 서버를 사용했다.
실제 모델의 답변 품질이나 운영 프록시 동작을 검증한 결과가 아니다.

브라우저는 `credentials: "include"`를 사용한다. POST SSE는 fetch의 응답 스트림으로 읽는다.
먼저 `GET /api/v1/auth/csrf`에서 token과 XSRF-TOKEN cookie를 받은 뒤 X-XSRF-TOKEN을 보낸다.

## Header

| Key | Type | Required | Example | Description |
| --- | --- | --- | --- | --- |
| Cookie | String | Yes | access cookie와 XSRF-TOKEN cookie | access cookie 기본 이름은 __Host-KNOT_ACCESS_TOKEN. 로컬 테스트는 KNOT_ACCESS_TOKEN. 브라우저 자동 전송 |
| Content-Type | String | Yes | application/json | JSON 요청 |
| Accept | String | Yes | text/event-stream | 정상 응답은 SSE, 접수 전 오류는 JSON |
| X-XSRF-TOKEN | String | Yes | CSRF 조회 응답 token | XSRF-TOKEN cookie와 일치하는 토큰 |

## Path Parameter

| Key | Type | Required | Example | Description |
| --- | --- | --- | --- | --- |
| workspaceId | Long | Yes | 12 | 현재 활성 멤버인 Workspace. 1 이상 |

## Query Parameter

| Key | Type | Required | Example | Description |
| --- | --- | --- | --- | --- |
| 없음 | - | - | - | Query Parameter 없음 |

## Request Body

| Field | Type | Required | Nullable | Description | Example |
| --- | --- | --- | --- | --- | --- |
| content | String | Yes | No | 공백이 아닌 첫 질문. 공백 포함 최대 2,000 Unicode 코드 포인트. 원문 그대로 저장 | 문서 보관 기준이 뭐야? |
| requestId | UUID String | Yes | No | 8-4-4-4-12 형식의 UUID. 대화 보존 기간 동안 중복 방지 기록 유지 | aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee |

공백 판정은 Java whitespace와 Unicode separator를 포함한다.
이모지 😀는 코드 포인트 하나로 세지만 복합 이모지와 결합 문자는 여러 코드 포인트일 수 있다.
축약 UUID, 앞뒤 공백이 붙은 UUID는 거절한다.

### Request Example

```json
{
  "content": "문서 보관 기준이 뭐야?",
  "requestId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
}
```

## Response

### Status Code

| Status | Description |
| --- | --- |
| 200 | 접수 커밋 뒤 accepted부터 SSE 전송. 마지막 종료 이벤트 뒤 EOF |
| 400 | 질문·requestId·본문·경로 오류 |
| 401 | 유효한 access 인증 없음 |
| 403 | Workspace 접근 또는 CSRF 거절 |
| 409 | 같은 요청 키의 본문 충돌 |
| 500 | 접수 전 생성 준비·전송 용량 또는 저장 오류 |

정상 응답 헤더는 `Content-Type: text/event-stream;charset=UTF-8`,
`Cache-Control: no-cache`, `X-Accel-Buffering: no`다.

### Response Body

| Event | Data 필드 | Nullable | Description | Example |
| --- | --- | --- | --- | --- |
| accepted | conversationId, questionMessageId, answerMessageId: Long | No | 항상 첫 이벤트. 신규 접수 또는 기존 접수의 ID | 아래 예시 |
| progress | stage: String | No | SEARCHING 또는 GENERATING. 빠른 작업은 polling 사이 중간 단계를 건너뛸 수 있음 | GENERATING |
| delta | answerMessageId: Long, text: String | No | DB에 저장된 이후 본문. 인접 조각이 합쳐져 전송될 수 있음 | 문서 기준은… |
| evidence | answerMessageId: Long, items: Array | No | 종료 직전 사용 근거. 없으면 [] | 아래 예시 |
| excluded_documents | count: Integer | No | 검색 adapter가 보고한 준비·실패 제외 수. 확보한 경우 한 연결에서 한 번 전송 | 2 |
| completed | answerMessageId: Long, status: String | No | COMPLETED 종료 | COMPLETED |
| failed | answerMessageId: Long, status: String, code: String | No | FAILED 종료. 공급자의 오류 원문을 노출하지 않음 | ANSWER_GENERATION_FAILED |
| stopped | answerMessageId: Long, status: String | No | STOPPED 종료 상태의 전송 지원. 실제 중지 endpoint는 #568 범위 | STOPPED |

evidence.items의 필드는 다음과 같다. 카드 제목·주제는 현재 Document에서 읽는다.

| Field | Type | Nullable | Description | Example |
| --- | --- | --- | --- | --- |
| documentId | Long | No | 현재 Workspace의 실제 사용 Document ID | 81 |
| title | String | No | 문서 제목 | 보관 정책 |
| topic | String | No | 문서 주제 | 문서 정책 |
| rank | Integer | No | 반환 순위 1..3. 같은 문서 중복 불가 | 1 |

### Response Example

```text
event:accepted
data:{"conversationId":301,"questionMessageId":601,"answerMessageId":602}

event:progress
data:{"stage":"GENERATING"}

event:excluded_documents
data:{"count":2}

event:delta
data:{"answerMessageId":602,"text":"문서 기준을 정리하면…"}

event:evidence
data:{"answerMessageId":602,"items":[{"documentId":81,"title":"보관 정책","topic":"문서 정책","rank":1}]}

event:completed
data:{"answerMessageId":602,"status":"COMPLETED"}

```

JSON 필드의 출력 순서와 delta 조각 수는 계약이 아니다.

## Error Response

| Status | Error Code | Description |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 공백 질문, 2,000 코드 포인트 초과, requestId 형식·필수값 오류 |
| 400 | INVALID_REQUEST_BODY | JSON을 읽을 수 없음. content·requestId에 숫자·불리언·배열·객체를 넣어도 거절 |
| 400 | INVALID_PARAMETER | Workspace 경로 형식·양수 범위 오류 |
| 401 | UNAUTHENTICATED | 유효한 access cookie 없음. CSRF 검사도 별도로 통과해야 함 |
| 403 | FORBIDDEN | 기존 Security의 CSRF 누락·불일치 |
| 403 | WORKSPACE_ACCESS_DENIED | 삭제된 Workspace, 현재 멤버십 없음·탈퇴 |
| 409 | REQUEST_ID_CONFLICT | 동일 Member·Workspace·요청 종류·대상·requestId에 다른 원문 사용 |
| 500 | ANSWER_GENERATION_UNAVAILABLE | worker 비활성, adapter 미연결 또는 접수 전 전송 용량 확보 실패 |
| 500 | INTERNAL_SERVER_ERROR | 접수 전 저장 등 예상하지 못한 오류 |

```json
{"code":"REQUEST_ID_CONFLICT","message":"다른 질문에 사용한 requestId입니다"}
```

접수 후 생성 오류는 HTTP 상태를 변경하지 않고 failed 이벤트로 전달한다.
현재 공개 실패 코드는 ANSWER_GENERATION_FAILED, ANSWER_GENERATION_TIMEOUT, SEARCH_ACCESS_DENIED다.
시간 초과는 부분 본문을 유지하고 FAILED로 끝낸다. 자동 재생성하지 않는다.

## 접수·복구 규칙

- 신규 접수는 대화·USER RECEIVED(sequence=1)·ASSISTANT STREAMING(sequence=2, 빈 본문)·접수 기록·QUEUED 실행을 함께 저장한다.
- 저장 중 오류는 전부 rollback한다. accepted는 commit 이후에만 전송한다.
- 검색·생성 호출은 접수/부분 저장 트랜잭션 밖에서 진행한다.
- 같은 요청 키와 동일 원문이면 기존 세 ID를 반환하고 추가 대화·질문·작업을 만들지 않는다.
- 중복 POST 연결은 accepted 뒤 현재 저장 본문을 처음부터 delta로 전달하고 이후 새 본문을 잇는다.
  FE는 해당 answerMessageId의 표시 버퍼를 먼저 교체해야 중복 append를 피할 수 있다. FE 반영 여부는 별도 확인이 필요하다.
- 다른 멤버·Workspace는 같은 UUID를 독립적으로 사용할 수 있다.
- 접수 commit 직후 응답이 유실될 수 있다. 이 경우 같은 requestId와 같은 본문으로 기존 접수 ID를 복구한다.
  입력을 바꿔 전송하면 새 requestId를 사용한다. 클라이언트의 자동 재전송은 요구하지 않는다.
- 연결 종료·화면 이동은 생성 취소로 처리하지 않는다. worker는 DB 작업을 기준으로 실행한다.
- 아직 실행하지 않은 QUEUED는 재시작 후 다시 선점한다. RUNNING은 기한까지 기다리고 만료 시 부분 본문 보존·FAILED 처리한다.
  이전 token이나 기한 이후 callback은 본문·종료 상태를 변경하지 못한다.
- 첫 답변 FAILED는 대화 목록에서 숨긴다. 질문·부분 답변은 보존되며 소유자는 메시지 GET으로 읽을 수 있다.
- 검색 없음은 녹음 안내 COMPLETED로 처리한다. 검색 오류는 FAILED로 구분한다.
- 실제 사용 문서는 검색 후보의 부분집합이고 최대 3개다. 같은 Workspace의 Document만 연결한다.
  Transcript와 원문 인용은 저장·반환하지 않는다.
- excluded_documents는 이 POST 전송의 정보다. 메시지 GET에 추가 필드를 제공하지 않는다.
- 후속 질문·GET SSE 재연결·명시적 중지·실패 재시도는 각각 #566~#569에서 구현한다.

## 구현·운영 선행 조건

실제 SearchDocumentRetriever·SearchAnswerGenerator 구현과 문서 준비 완료/제외 수 기준을 먼저 확정해야 worker를 활성화할 수 있다.
현재 설정 기본값은 worker concurrency=2, 후보 조회=20, poll=1초, recovery=5초, 실행 기한=150초,
SSE 연결=8개, snapshot poll=100ms, 연결 timeout=3분이다.
이 값은 기술 운영 기본값이며 실제 공급자 timeout·취소 및 성능 평가는 아직 확인하지 않았다.
전송 timeout은 생성 취소를 의미하지 않는다.

추가 migration은 V41 접수 기록·실패 code, V42 실행 상태다. 부모 Search V37과 다른 열린 PR의 Recording V37/V38 충돌은
병합·배포 전에 정리해야 한다. 운영 DB에는 적용하지 않았다.
