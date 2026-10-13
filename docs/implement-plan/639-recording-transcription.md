# 녹음 업로드와 AI 전사 연결

[#639](https://github.com/woowacourse-teams/2026-Knot/issues/639)는 #637의 통신과 #638의 결과 저장을 같은 PR에서 연결한다.
AI 서버는 별도 PR #633의 계약을 사용한다. 1,000줄 강제 상한 대신 완결된 유스케이스를 기준으로 한다.

2026-10-13 사용자 결정으로 S3 버전 고정 GET을 사용한다. worker가 시작할 때 HEAD로 버전·형식·크기를 확인하고
그 versionId를 GET 서명에 포함한다. 이후 같은 key의 PUT은 전사 입력을 바꾸지 않는다.
버전이 없거나 비어 있거나 literal `null` 버전이면 `AUDIO_STORAGE_UNAVAILABLE`로 거절한다.
실제 버킷의 버전 관리·연결 경로는 아직 검증하지 않았으며 버킷 설정을 변경하지 않았다.

## 실행 흐름

1. 업로드 완료 트랜잭션에서 권한·종료·오디오를 검증하고 완료 상태와 전사 시도를 함께 저장한다.
2. 현재 시도는 녹음당 하나다. 전역 `PROCESSING` 슬롯은 advisory lock과 partial unique index로 하나만 허용한다.
   다른 녹음이 실행 중이면 새 녹음은 `FAILED/BUSY`로 남는다. 대기열·자동 재시도·시도 이력은 없다.
3. 커밋 뒤 worker 하나가 입력 URL을 발급하고 AI에 POST한다. 저장소·AI 호출 중 DB 트랜잭션을 유지하지 않는다.
4. POST 응답이 유실되면 같은 `attemptId`를 GET으로 확인한다. 새 ID나 POST 반복으로 접수를 추정하지 않는다.
   같은 시도를 유한 시간 동안 조회하고, 조회 실패·작업 소실은 실패로 저장한다.
5. 성공 시 Workspace→Recording→현재 전사 시도 순으로 잠그고 UUID·`PROCESSING`을 다시 확인한다.
   원본 Whisper JSON을 `Transcript.content`에 그대로 보존하고, 발화 순서·밀리초 시각·화자 번호를 구간으로 저장한다.
   화자 번호는 처음 등장한 label 순서로 1부터 부여하며 Member로 추정하지 않는다.
6. 같은 트랜잭션에서 `DocumentGenerationIntakeService.acceptCompletedTranscript`를 호출한다.
   실패하면 원문·구간·접수·성공을 모두 롤백한다. 결과 또는 실패 상태가 확정되기 전 다음 작업을 제출하지 않는다.
7. 결과와 실패 상태 저장이 모두 실패하면 worker 슬롯을 유지한다. 재시작하면 DB의 진행 시도를
   `FAILED/SERVER_RESTARTED`로 회수한다. 자동 재개하지 않으며 사용자가 실패 시도를 명시적으로 재시도한다.

`Transcript.content`는 평문 전사가 아니라 원본 JSON이다. 기존 문서 생성 입력도 이 content를 전달한다.
발화별 표시·시각·화자는 `TranscriptSegment`에 저장한다. 원문 보관 기간 정리 시 transcript 참조만 해제하고
전사 성공 상태를 보존해 삭제된 원문이 자동으로 다시 생성되지 않게 한다.

## 운영 설정

| 환경 변수 | 기본값 | 의미 |
| --- | --- | --- |
| `TRANSCRIPTION_ENABLED` | `false` | 자동 접수·재시도 활성화 |
| `TRANSCRIPTION_BASE_URL` | `http://127.0.0.1:18765` | AI 서버 origin |
| `TRANSCRIPTION_TOKEN` | 빈 값 | 활성화 시 필요한 Bearer 토큰 |
| `TRANSCRIPTION_CONNECT_TIMEOUT` | `PT5S` | 연결 제한 |
| `TRANSCRIPTION_REQUEST_TIMEOUT` | `PT30S` | 본문 수신 포함 요청 제한 |
| `TRANSCRIPTION_POLL_INTERVAL` | `PT2S` | 진행 조회 간격 |
| `TRANSCRIPTION_JOB_TIMEOUT` | `PT12H` | Backend 접수부터 작업 기한 |

기한을 넘긴 실행은 다음 검사에서 실패한다. 진행 중인 요청 하나는 자신의 요청 제한 시간까지 걸릴 수 있다.
AI 응답은 256MiB로 제한하고 리다이렉트를 따르지 않는다. URL·토큰·원문·공급자 오류 메시지는 로그에 복사하지 않는다.

저장소는 기존 `recording.audio-storage.*` 설정을 사용한다. 전사하려는 객체에 실제 S3 versionId가 있어야 하고,
서명 주체에 해당 버전의 `s3:GetObjectVersion` 권한이 필요하다. GET 유효 기간은 기존 업로드 URL TTL을 사용한다.
AI downloader가 허용하는 AWS S3 HTTPS endpoint를 사용해야 하며 NCP·임의 endpoint는 허용하지 않는다.
Backend 재시작은 진행 시도를 실패로 회수하므로 입력 버전을 별도 DB 컬럼에 저장하거나 자동 재개하지 않는다.

Backend 프로세스 하나의 운영을 전제로 한다. DB admission은 동시 요청을 막지만 재기동 회수는 여러 인스턴스의
lease 복구 프로토콜이 아니다. AI 취소 API가 없어 Backend의 제한 시간 이후 모델이 실행 중이면 다음 요청은 BUSY일 수 있다.

## 계약과 검증 범위

- 업로드 완료 응답은 기존 `200`과 필드를 유지한다. 전사 활성화 시 비동기 접수를 연결한다.
- [녹음 단건 조회](../api/recording-detail.md)는 기존 세션 `status`를 유지하고 nullable 전사 상태를 추가한다.
- [재시도](../api/recording-transcription-retry.md)는 실패 시에만 새 UUID를 접수한다.
- AI HTTP stub 검증과 PostgreSQL 검증은 실제 Mac mini·EC2·S3 운영 연결을 입증하지 않는다.
  실제 버킷 조회는 로컬 AWS 키의 `InvalidAccessKeyId`로 실패했다. 자격 증명·버킷·운영 배포는 변경하지 않았다.

## 컨벤션 적용 장부

| 규칙군 | 적용 근거 |
| --- | --- |
| STACK | 기존 Java 25·Spring Boot·PostgreSQL·AWS SDK 사용 |
| LIB | 신규 의존성 없음 |
| LAYER | Application의 외부 통신 Port, Infrastructure HTTP·S3 구현, 별도 Tx 상태 서비스 |
| MODEL | 현재 시도·전이 불변식은 Entity, HTTP/조회 입력·출력은 record |
| API | 로그인·CSRF·현재 소속·녹음 소유권, 기존 세션 상태 의미 보존 |
| DB | V49 추가, 현재 시도 unique, 전역 processing partial index, 같은 녹음의 transcript FK, retention 호환 |
| JAVA | 팀 formatter·필드 배치·다중 인자 줄바꿈·한글 정적 오류 |
| TEST | HTTP stub, 단위, 실제 PostgreSQL 동시성·rollback, API 권한·CSRF |
| AI | attempt fencing·늦은 완료·삭제·부분 저장·원문 비노출을 독립 정적 리뷰로 확인 |
| DELIVERY | `be/feature/#639`, #637·#638 통합, 작업 단위 커밋과 기존 PR 템플릿 |

팀 컨벤션 00~08의 source hash gate는 통과했다. 승인된 로컬 Java/API 문서도 적용했으며 팀 Notion 동기화는 하지 않았다.
전체 자동 감사는 기존 소스의 위반과 heuristic 오탐을 포함한다. 변경 파일의 감사 결과와 실제 Gradle 결과는 최종 검증에 기록한다.

## 2026-10-13 검증

- `./gradlew spotlessApply spotlessCheck test integrationTest acceptanceTest bootJar`: 성공.
  단위 1,408건·통합 627건·인수 546건, 실패·오류·생략 0건이다.
- 이후 추가한 결과 불변식과 연결 시험: `integrationTest --tests '*RecordingTranscriptionStateIntegrationTest'
  --tests '*RecordingTranscriptionFlowIntegrationTest' bootJar` 성공. 상태 21건·실제 HTTP adapter 연결 2건이 통과했다.
- `python3 -m unittest discover .github/scripts -p 'test_*.py' -v`: 8건 통과.
- source hash gate 통과, 최종 변경 파일 자동 감사 위반 0건. 전체 소스 감사는 기존 1,163건을 보고해
  공통 `verify_backend.py --full`이 Gradle 전에 중단됐다. 위 Gradle task를 직접 실행해 검증했다.
- 독립 정적 리뷰에서 추가 수정 항목을 발견하지 못했다. 실제 S3·운영 경로 검증은 남아 있다.
- 후속 버전 고정 GET 서명·버전 없음/`null`·메타데이터 불일치·객체 소실 거절과 HTTP→DB 연결 시험을 통과했다.
  `spotlessCheck test --tests '*S3RecordingAudioStorageTest' --tests '*RecordingTranscriptionServiceTest'
  integrationTest --tests '*RecordingTranscriptionStateIntegrationTest' --tests '*RecordingTranscriptionFlowIntegrationTest'
  bootJar` 성공: 저장소 14건·worker 19건·상태 21건·연결 2건, 실패·오류 0건이다.
