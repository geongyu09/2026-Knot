# #620 서버 오류 로그의 원인 정보와 수준 보완 구현 계획

## 1. 범위와 브랜치

상태: 계획 작성 및 GitHub Issue 게시 완료. 코드 구현 전.
확인 날짜: 2026-10-12.
대상: [Issue #620](https://github.com/woowacourse-teams/2026-Knot/issues/620).
담당자: jyt6640. 라벨: 흑곰, BE, BugFix.
현재 브랜치: `be/feature/#566`. 새 브랜치를 만들지 않았다.

공통 처리기·탐색 SSE·OAuth·문서/탐색/오디오 삭제 워커·관련 스케줄러의 원인 로그와 수준을 보완한다.
HTTP 상태 분류는 [#619](https://github.com/woowacourse-teams/2026-Knot/issues/619)에서 먼저 적용하도록 권장한다.
외부 응답과 인증·권한·재시도·취소·보존 정책은 이번 로그 개선의 변경 대상이 아니다.

| 근거 | 확인 시점·revision | 적용 사실 | 판정 |
| --- | --- | --- | --- |
| 사용자 로그 점검·Issue 분리 지시 | 2026-10-12 | 공통 예외와 별도 로그 Issue, 두 Issue 게시 | 확정 |
| production Java 점검 | 513개 파일, 로그 호출 17곳·11개 파일, catch 포함 52개 파일 | 17곳을 읽고 주요 인증·워커·SSE catch 경계 조사 | 정적 관측, 전체 실행 경로·운영 관측 아님 |
| [GlobalExceptionHandler](/Users/yongtae/Desktop/knot/backend/src/main/java/com/knot/backend/global/exception/GlobalExceptionHandler.java:24)·[탐색 처리기](/Users/yongtae/Desktop/knot/backend/src/main/java/com/knot/backend/global/exception/SearchQuestionExceptionHandler.java:49) | 현재 checkout | 일반 예외·프로젝트 5xx·committed 분기 원인 로그 없음 | 구현 관측 |
| [OAuth 기존 비밀값 테스트](/Users/yongtae/Desktop/knot/backend/src/test/java/com/knot/backend/auth/presentation/handler/OAuth2AuthenticationSuccessHandlerTest.java:351) | 현재 checkout | private-refresh-secret이 로그에 없어야 함 | 기존 계약, Throwable 원문 일괄 출력 금지 근거 |
| [공통 계약 #155](https://github.com/woowacourse-teams/2026-Knot/issues/155) | 2026-10-12 조회 | 공통 오류 응답 내부 정보 비노출 | 기존 계약 |
| [신 API 명세](https://app.notion.com/p/API-3deb4351752280e2ad98f2b5c5670fb2) | revision 2026-09-30T06:23:00Z, 캡처 2026-10-07T13:07:32.841Z | 오류 envelope·인증·CSRF 관련 캐시 확인 | unsupported 블록 존재, 최신 원문 미검증 |
| [운영 관측 문서](/Users/yongtae/Desktop/knot/backend/docs/operations/sprint-1-observability.md) | 2026-10-12 읽음 | journal → Alloy → Loki, 요청 민감정보 제외 | 과거 문서, 실제 호스트 미검증 |
| origin/develop | SHA 7da73e04f8e891fb9333d5cb05d6c56951da01fc | 공통 예외 파일 일치, 조사 시 관련 BE 열린 PR 없음 | 저장소 관측 |

[현재 V2 기준](/Users/yongtae/Desktop/knot/docs/product/current-v2-mvp.md)과
[Notion 근거 지침](/Users/yongtae/Desktop/knot/backend/docs/notion-context.md)을 읽고 적용 범위를 확인했다.
고위험 shared·security 계약은 pass, 자료 충분으로 인터뷰 생략이다.
기존 진단 누락 보완이며 로그 인프라·보존 아키텍처를 선택하지 않아 ADR은 필요 없다.

## 2. 구현할 흐름

```text
HTTP 내부 실패 → 최종 공통 처리 경계 → 안전한 원인 로그 1건 + 기존 500 응답
SSE 시작 전 실패 → global 위임 → 같은 기록
SSE 시작 후 실패 → 탐색 경계 기록 → 기존 상태·빈 body·비동기 종료
비동기 작업 실패 → 원인 보존 → 최종 worker/scheduler 경계 기록 + 기존 상태 처리
OAuth 내부 실패 → 안전한 원인 기록 + 기존 인증 실패 처리
정상 취소·접근 철회 → 기존 종료/정리, 장애 WARN·ERROR로 기록하지 않음
```

예외 타입·원인 체인·스택 위치로 원인을 진단하며 원문 메시지·SQL·외부 응답·credential을 추가 로그에 넣지 않는다.
작업 ID·단계·attempt는 해당 작업에서 이미 갖는 안전한 식별자만 사용한다.
복구 가능한 알려진 실패는 WARN, 예상 밖 내부 장애는 ERROR, 정상 요약은 기존 INFO로 유지한다.
용량 제한·인터럽트 등을 정상 제어 흐름으로 처리하는 기존 경계는 장애로 확대하지 않는다.

## 3. 나올 코드와 메서드 초안

아래 경계와 동작은 현재 코드에서 확인했다. 변경과 메서드 이름은 구현 제안이다.
경로는 backend/src/main/java/com/knot/backend 아래에 있다.

| 기존 클래스·메서드 | 현재 관측 | 제안 책임 |
| --- | --- | --- |
| global/exception/GlobalExceptionHandler.handleUnexpectedException·handleProjectException | 일반·프로젝트 내부 오류 무로그 | 예상 밖·프로젝트 5xx에만 안전한 진단 로그, 기존 응답·Retry-After 유지 |
| global/exception/SearchQuestionExceptionHandler.handleUnexpectedException·handleProjectException | committed에서 global 우회 | 시작 전은 global 한 번, 시작 후는 여기서 한 번 기록하고 기존 종료 |
| auth/presentation/handler/OAuth2AuthenticationSuccessHandler·FailureHandler | 내부 실패 원인 type/code만 기록, 인증 거절과 내부 장애 구분 부족 | 기존 비밀값 보호를 유지하며 내부 오류 진단·수준 구분 |
| document/application/DocumentGenerationWorker.fail | job/stage/attempt/cause enum만 전달, 원래 Throwable 소실 | 실패 입력에 원인 보존, 작업 실패와 실패 상태 저장 실패를 각각 기록 |
| search/application/SearchAnswerWorker | RuntimeException type만 WARN, 정상 CancellationException도 포함 | 정상 취소를 분리하고 실제 실패의 원인 기록 |
| recording/application/RecordingAudioDeletionWorker | state.fail 후 원인 없는 WARN | state.fail 자체가 실패해도 최초 저장소 원인과 상태 저장 실패가 진단되게 기록 |
| document/infrastructure/DocumentGenerationScheduler·RetentionCleanupScheduler, search/infrastructure/SearchAnswerScheduler | 실행·복구·정리 실패 ID만 WARN | 안전한 작업 문맥과 원인 추가, 재시도 정책 유지 |
| search/presentation/stream/SearchAnswerStream | SearchException 변환에서 cause 소실 | 기존 SearchException(code, cause) 생성자로 원인 보존, 중간 중복 로그 금지 |
| search/infrastructure/SearchTransportCancellation | RuntimeException 후 종료만 수행 | 예상 접근 철회와 내부 오류를 구분하고 내부 오류 진단 |

안전한 출력 규칙이 여러 경계에서 반복되면 기존 global 패키지 안에 작은 공통 진단 도구를 두는 방안을 제안한다.
`describe(Throwable)` 같은 메서드는 메시지를 읽어 출력하지 않고 타입·cause·스택 위치만 반환한다.
이 도구와 이름은 아직 존재하지 않는 제안이며, null·순환 cause·suppressed와 출력량 제한을 검증한 뒤 채택한다.
예외 원문을 정규식으로 일부 가리는 방식만으로 credential 보호를 보장하지 않는다.

JwtLogoutHandler의 ERROR+Throwable, RecordingConnectionExpiryService의 항목 실패 WARN+Throwable,
RecordingConnectionExpiryScheduler의 양수 건수 INFO는 현재 목적에 맞는 기록이다.
앞의 두 Throwable 로그의 메시지 민감성은 정적 조사만으로 안전하다고 확정하지 않았다.
SearchAnswerReconnectConnection·SearchTransportRegistration의 연결 종료 IOException 무로그는 이유가 있는 정리 경로이므로
catch마다 ERROR를 일괄 추가하지 않는다.

## 4. 저장 기반과 주의할 점

DB·Entity·Flyway·로그 저장 테이블 변경은 없다.
실패 상태 저장·재시도·취소 등의 기존 비즈니스 부작용은 유지한다.
로그를 먼저 남겨야 하는 이중 실패 경계는 원래 상태 변경의 의미와 예외 전파를 바꾸지 않도록 검증한다.

같은 예외가 adapter·worker·scheduler를 통과하면 소비하거나 최종 처리하는 경계를 기록 책임으로 정한다.
adapter는 cause 보존이 우선이며 재던지면서 동일 장애를 중복 기록하지 않는다.
별도로 발생한 실패 상태 저장 실패는 최초 작업 실패와 다른 이벤트로 진단할 수 있어야 한다.
SSE committed 응답에 JSON이나 500 status를 다시 쓰지 않는다.
원문 메시지·cause·suppressed의 비밀값과 요청 body·Cookie·Authorization·query를 새 로그에 출력하지 않는다.
이번 계획은 애플리케이션 코드 대상이며 실제 호스트 수집·Loki 보존·외부 라이브러리 전체 로그 감사는 수행하지 않았다.

## 5. TDD와 검증 순서

아래 테스트는 구현 예정이다. 이번 기획에서 로그 개선 코드를 구현하거나 신규 테스트를 실행하지 않았다.

| 테스트 위치·방식 | 성공·실패·경계 | 기대 결과 |
| --- | --- | --- |
| 제안 안전한 진단 도구 단위 테스트 | null·cause·순환·suppressed·민감 메시지 | 진단 타입·스택 위치 포함, 민감 표식 없음, 종료·출력 한도 |
| 기존 GlobalExceptionHandlerTest + ListAppender | 일반 실패·프로젝트 5xx·4xx·정상 호출 | 기존 응답, 내부 실패 ERROR 1건, 4xx 장애 ERROR 없음 |
| 기존 SearchQuestionExceptionHandlerTest | 시작 전·후 5xx와 4xx | 로그 누락·중복 없음, 기존 committed 상태·본문·종료 |
| 기존 OAuth 성공·실패 HandlerTest + OutputCapture | 정상 인증·거절·공급자/내부 실패 | 인증 처리 유지, 수준 구분, 기존 credential 비노출 테스트 유지 |
| 제안 각 Worker 단위 테스트, 기존 각 SchedulerTest | 정상 실행·복구 가능한 실패·내부 실패·정상 취소 | ID·단계·attempt·안전한 원인 및 수준, 상태·재시도 유지 |
| 오디오 삭제·문서 Worker 실패 테스트 | 최초 작업 실패 후 실패 상태 저장도 실패 | 두 원인이 각각 남고 예외 전파·상태 정책 유지 |
| 기존 SearchAnswerStreamTest·SearchTransportCancellationTest | 정상 스트림·executor/시작 실패·접근 철회·예상 밖 실패 | 변환 cause 보존, 정상 취소 장애 로그 없음, 내부 실패 진단 |

1. 안전한 원인 출력의 민감 표식·순환 실패 테스트 → 필요한 최소 공통 진단 구현.
2. 일반 서버 오류와 프로젝트 5xx 로그 누락 테스트 → global 최종 경계 기록. 4xx·응답 회귀 확인.
3. SSE 시작 전/후 기록 횟수 실패 테스트 → committed 분기만 보완.
4. OAuth 내부 오류·인증 거절·비밀값 테스트 → 안전한 진단과 수준 분류.
5. 문서·탐색·오디오 각 worker의 원인·정상 취소·이중 실패 테스트 → worker별 최소 변경.
6. 각 scheduler의 복구·실행 실패 테스트 → 진단 문맥 추가, 중복 기록 확인.
7. 탐색 예외 변환·접근 철회 테스트 → cause 보존과 최종 경계 분류.
8. 집중 검증 후 공유 동작의 기존 Backend CI gate 수행.

각 동작마다 실패 테스트 → 최소 구현으로 진행한다. fixture는 중첩 class 없이 별도 파일을 사용한다.
ListAppender는 테스트 전후 연결·해제하며 level·logger·횟수·원인 타입·식별자·민감값을 검증한다.
Mockito는 분기와 상태 호출을 검증하며 실제 DB lock·트랜잭션이나 운영 로그 수집을 증명하지 않는다.

구현 시 확인된 명령:

```sh
cd /Users/yongtae/Desktop/knot/backend
npx ph workflow implement
./gradlew test --tests 'com.knot.backend.global.exception.*' --tests 'com.knot.backend.auth.presentation.handler.*' --tests 'com.knot.backend.document.*' --tests 'com.knot.backend.search.*' --tests 'com.knot.backend.recording.*'
./gradlew test spotlessCheck
./gradlew integrationTest acceptanceTest bootJar
npx ph workflow finish implement
```

build.gradle과 Backend CI에서 명령·tag 분리를 확인했다.
integration/acceptance에는 Docker·Testcontainers가 필요하다.
Persona 구현·리뷰 보고서는 실제 구현 단계에서 작성한다.
커밋 요청 시 각 최종 처리 경계·cause 보존·문서 단위로 분리하고 test → feat 순서를 검토한다.

## 6. 완료 기준과 다음 작업

내부 장애 원인 타입·cause·스택 위치·작업 문맥이 안전하게 기록되고 정상 취소와 4xx를 장애로 기록하지 않아야 한다.
기존 HTTP·SSE·OAuth 응답과 실패 상태·재시도·취소 처리가 유지되고 집중 테스트와 CI gate가 통과하면 구현 완료다.
실제 호스트 관측은 별도 운영 검증이며 합성 테스트 결과로 대체하지 않는다.

이번 완료 범위는 코드 점검·계약 검증·두 Issue 분리·계획 저장·실제 게시다.
게시 검증: status=pass, action=publish_issue, requested_action=publish_issue,
remote_write_authorized=true, contract_id=e7b7da1a3b0d27d2.
원격 본문·assignee jyt6640·흑곰·BE·BugFix 라벨을 조회했다.
선행 연결 작업: [#619 구현 계획](/Users/yongtae/Desktop/knot/docs/implement-plan/619-http-error-classification.md).
