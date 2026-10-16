# #697 첫 SSE delta 수동 실측

실제 Qwen·Spring HTTP SSE·MCP 문서 도구·Testcontainers PostgreSQL을 실행한다. 기본 `check`와 CI에는 이 소스를 추가하지 않는다. Dev/RDS에 접근하지 않는다.

Java25·Docker와 인증된 `qwen3.8-27b` 서버가 필요하다. SSH 터널 `127.0.0.1:18997 → 모델 서버 127.0.0.1:1234`를 준비하고, 비공개 환경 설정으로 `KNOT_LLM_API_KEY`를 주입한다. 키를 명령 인수·소스·실행 기록에 넣지 않는다. 모델 설정과 가중치는 변경하지 않는다.

저장소 backend에서 실행한다. `latency.source`는 이 디렉터리의 절대 경로다. 변경 전 코드에서도 같은 수동 소스를 사용한다.

```sh
JAVA_HOME=$(/usr/libexec/java_home -v 25) ./gradlew --no-daemon \
  -I ../docs/qa/697-latency/latency.gradle \
  -Dlatency.source="$(cd ../docs/qa/697-latency && pwd)" \
  -Dlatency.variant=after -Dlatency.samples=5 intentLatency
```

변경 전 `456f5024`를 별도 디렉터리에 checkout/export하고 위 init script와 source 경로는 현재 PR의 절대 경로로 지정한다. `latency.variant=before`로 구분하고 두 실행을 동시에 돌리지 않는다.

- 합성 문서 하나: DRAFT, 주제 `배포`, 제목 `배포 회의 결정`, 본문에 배포 담당자 `흑곰`·날짜 `금요일`을 명시한다.
- 같은 질문을 새 대화에 전송한다. 현재 질문은 `지난 배포 회의에서 배포 담당자는 누구로 정했어?`이며 이전 대화는 없다.
- index 0은 워밍업, 1~5는 측정 표본이다. 각 실행의 `LATENCY_RESULT`에 accepted·첫 delta·전체 종료 시간을 ms로 기록한다.
- 시작은 클라이언트의 POST 전송 직전, 첫 delta는 완전한 SSE delta 이벤트를 클라이언트가 수신한 시점이다. CSRF 발급·애플리케이션 부팅·fixture 저장 시간은 제외한다.
- 주기적 작업 선점의 변동을 제거하려고 스케줄러를 끄고 availability 검사만 mock한다. 실제 접수 commit과 accepted 수신 후 제품 worker를 비동기로 한 번 실행한다. 분류기·검색기·생성기·권한·DB·MCP·SSE는 제품 구현이다. 운영 큐 대기·프록시·TLS 지연은 포함하지 않는다.
- delta의 `text`를 JSON으로 파싱해 이어 붙이고 담당자 사실과 COMPLETED를 확인한다. 전송 조각 사이에 이름이 나뉘어도 정상이다.
- CSV의 분류 시간은 worker의 `Search intent classified` 로그를 호출 순서대로 대응한다. MCP HTTP 200 수는 각 호출 구간의 `RequestIdFilter` 로그에서 POST·200·REQUEST·async_started=false를 센 값이며 초기화와 도구 정의 조회도 포함한다. 질문 POST는 async_started=true로 구분한다.

작은 고정 질문의 지연 실측이며 검색 정확도 평가나 운영 p95 보장이 아니다. 결과와 초기 측정기 오류는 [QA 기록](../697-search-intent-classification.md)에 함께 남긴다.
