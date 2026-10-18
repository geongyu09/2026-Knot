# Dev 문서 요청별 JDBC 시간 계측

## 적용 범위

`dev` 프로파일의 문서 목록/상세 GET 요청에만 요청 컨텍스트를 만든다.
기존 `X-Request-ID` 필터 다음, 인증과 서비스 실행 전에 시작하므로 인증 SQL도 포함된다.
`prod`가 함께 활성화되면 계측 설정은 적용되지 않는다. 비동기 작업이나 SSE 전체 계측은 아니다.
구현과 로컬 PostgreSQL/Hikari 검증을 완료했으며 실제 Dev 배포와 부하 재측정은 별도다.

| 환경 변수 | 기본값 | 동작 |
| --- | --- | --- |
| `JDBC_TIMING_ENABLED` | `true` | Dev 계측 활성화. `false`로 장식과 필터 비활성화 |
| `JDBC_TIMING_SLOW_REQUEST_MS` | `500` | 서버 요청 전체 시간이 이 값 이상이면 로그. 짧은 진단에서 `0`이면 모든 대상 요청 |

기본값에서도 연결 획득 실패 또는 SQL 실패 요청은 기록한다.
설정 변경은 프로세스 시작 때 적용된다. 지속 고부하에서는 기본 임계값으로 느린 요청만 남긴다.

## 로그 읽기

한 요청에 `DB_REQUEST_TIMING` 로그 하나를 남기고 기존 로그 패턴의 `request_id`로 연결한다.
`status`는 이 필터가 반환될 당시 응답 상태다. 처리되지 않은 예외 뒤의 ERROR 재디스패치가
최종 상태를 정하기 전일 수 있으므로 예외 요청의 최종 HTTP 상태는 Nginx 로그와 함께 확인한다.

| 필드 | 측정 범위 |
| --- | --- |
| `request_ms` | 문서 요청 필터 진입부터 동기 체인 반환까지 |
| `acquire_count`, `acquire_failures` | JDBC 연결 획득 시도와 실패 횟수 |
| `acquire_ms`, `acquire_max_ms` | DataSource.getConnection 호출의 합계와 최대. 풀 대기, 필요 시 연결 생성 포함 |
| `usage_ms`, `usage_max_ms` | 획득 완료부터 close 반환까지의 합계와 최대 |
| `open_connections` | 요청이 끝났는데 반환 완료를 관측하지 못한 연결 수 |
| `sql_count`, `sql_failures` | JDBC execute 호출과 실패 횟수. batch 실행은 호출 한 번으로 셈 |
| `sql_ms`, `sql_max_ms` | JDBC execute 합계와 최대. 드라이버/DB 통신 포함, 후속 ResultSet 순회는 제외 |
| `connections` | 연결 ID별 획득/점유 시간, 최대 64개 |
| `sql_samples` | 실행 순서, 연결 ID, SQL 해시, 실행 시간, 성공 여부, 최대 64개 |
| `result_set_count` | 관측한 결과셋 수. 닫기 전 동일 결과셋의 반복 getResultSet은 한 번으로 셈 |
| `result_set_ms` | 명시적 close 성공까지 완료된 결과셋 소비 구간 합계 |
| `result_set_jdbc_ms` | ResultSet의 next, getter, 메타데이터, close 등 실제 JDBC 메서드 호출 시간 합계 |
| `open_result_sets` | 요청 종료 시 명시적 close 성공을 관측하지 못한 결과셋 수 |
| `result_set_samples` | SQL 순번, 연결 ID, 요청 시작 기준 시작 시차, 소비 구간, JDBC 호출 합계, next가 true인 횟수, 실패 수, close 완료 여부. 최대 64개 |
| `phase_count`, `phase_counts`, `phase_ms` | 종료 및 조회 구간의 전체 횟수, 종류별 횟수와 시간 합계 |
| `phase_failures` | 결과셋 메서드, JDBC 종료/복구, Spring 종료, 조회 어댑터 호출의 실패 횟수 |
| `phase_samples` | 구간 이름, 연결 ID, 요청 시작 기준 시작 시차, 소요 시간, 성공 여부, 조회 꼬리 시간. 최대 64개 |

합계와 횟수는 64개를 넘어도 계속 센다. 상세 배열이 64개이고 총횟수가 더 크면 상세는 일부다.
SQL 원문, 바인드 값, 쿠키, 토큰, 요청/응답 본문을 추가 로그에 넣지 않는다.
SQL 해시는 JDBC SQL 문자열의 MD5이며 파라미터와 개인정보 복구용 식별자가 아니다.
기존 애플리케이션 로그 정책까지 변경하는 기능은 아니다.

SQL 시간은 연결 점유 시간의 일부이므로 세 시간을 더해 요청 시간으로 계산하지 않는다.
SQL execute가 짧고 usage가 길면 결과 순회, 트랜잭션 안의 다른 작업과 커밋/반환 등을 조사한다.
acquire만 길면 같은 시간 Hikari active/pending과 다른 요청의 usage를 대조한다.
이 값은 순수 PostgreSQL 실행 시간이 아니므로 EXPLAIN ANALYZE 결과와 동일시하지 않는다.

## 결과 처리와 트랜잭션 종료 분리

| 구간 | 정확한 경계 |
| --- | --- |
| 결과셋 소비 `spanMs` | executeQuery 완료 시각부터 해당 ResultSet의 명시적 close 반환까지. execute 후 getResultSet으로 얻는 경우 getResultSet 반환부터 |
| 결과셋 JDBC `jdbcMs` | 위 결과셋의 JDBC 메서드 실행 합계. 드라이버 변환/추가 fetch와 실행 대기 포함 |
| `query_list_findTopics` | 목록 주제 조회 어댑터 진입부터 결과 DTO 반환 또는 예외까지 |
| `query_list_findPage` | 목록 페이지 조회 어댑터 진입부터 카드/확인 집계의 최종 DTO 반환 또는 예외까지 |
| `query_detail_find` | 상세 조회 어댑터 진입부터 스냅샷 변환 완료 또는 예외까지 |
| `afterLastResultCloseMs` | 그 조회 호출 안에서 마지막으로 관측한 결과셋 close 성공부터 어댑터 반환까지. 해당 close가 없으면 null |
| `spring_commit`, `spring_rollback` | PlatformTransactionManager의 commit/rollback 전체 호출. flush, 동기화 callback, 연결 상태 복구와 반환 정리 포함 |
| `jdbc_commit`, `jdbc_rollback` | Connection의 commit/rollback 호출 자체. savepoint rollback도 이 범주에 포함 |
| `jdbc_setAutoCommit`, `jdbc_setReadOnly`, `jdbc_setTransactionIsolation` | 연결 상태 설정/복구 호출. 트랜잭션 시작과 종료 양쪽에서 발생할 수 있으므로 시작 시차로 구분 |
| `jdbc_close` | Connection.close 호출 자체. 풀 반환과 Hikari 내부 정리 포함 |

결과셋의 `spanMs - jdbcMs`는 순회 사이의 Hibernate/projection 매핑, 계측, 스케줄링 대기 등을
포함한다. 순수 DTO 처리 CPU 시간으로 확정하지 않는다. close 이후 매핑은 조회 어댑터 구간과
`afterLastResultCloseMs`로 확인하며, 꼬리 시간에도 계측/실행 대기가 포함된다.
조회 구간에는 SQL과 경우에 따라 연결 획득도 포함된다. ResultSet getter에서 lazy fetch가
발생하면 그 DB 통신은 기존 sql_ms가 아닌 result_set_jdbc_ms에 포함된다.

Spring 종료 시간은 JDBC commit/rollback/복구/close 시간을 포함하므로 서로 더하지 않는다.
REQUIRES_NEW 등 중첩된 구간과 동시에 열어 둔 결과셋 span도 겹칠 수 있다.
연결 획득이 느리면 해당 요청보다 앞서 연결을 점유했던 요청의 구간도 함께 확인한다.

`open_result_sets`는 명시적 close 관측 상태이며 누수를 확정하는 값이 아니다. Statement나
Connection 종료가 결과셋을 암묵적으로 닫았을 수 있다. 실패한 close는 완료 시간 합계에
포함하지 않고 표본에 closed=false로 남긴다. 상세가 잘려도 전체 횟수/합계는 계속 센다.

새 구간은 기존 Dev 설정과 요청 컨텍스트를 공유하고, 임계값 미만이어도 구간 실패가 있으면
기록한다. ResultSet 메서드 프록시와 구간 측정은 부가 비용을 발생시킨다. 계측을 켠 부하
결과를 계측이 없던 실행의 성능 개선/악화로 곧바로 해석하지 않는다.
이번 확장은 로컬 단위 및 실제 PostgreSQL/Hibernate/Spring 트랜잭션으로 검증하며,
Dev 배포와 400 RPS 실제 원인 확인은 후속 단계다.

### 로컬 검증 결과 (2026-10-18)

- 단위23개와 Testcontainers PostgreSQL/Hibernate/Hikari/Spring 통합5개 통과. 실패/오류/스킵0.
- 실제 결과 행3개와 SQL순번, 조회 DTO 반환 구간, Spring 커밋에 포함되는 JDBC 커밋/상태 복구/연결 반환을 같은 요청 ID 로그에서 확인했다. Spring 롤백도 정상 반환을 확인했다.
- 결과 읽기/close 실패와 원래 예외 보존, 반복 close, 미닫힌 결과셋, 복수 결과셋 SQL순번, 상세64개 상한 이후 합계, Dev/Prod 경계를 확인했다.
- Spotless 및 diff 공백 검사 통과. 이 확인은 로컬 기능 검증이며 서버 배포 및 부하 검증 결과는 아니다.

## k6와 연결

기존 loadtest worktree에서 느린 요청(500ms 이상), HTTP/응답 검증 실패, 음수 timing 요청을
`<stage>/request-correlations.jsonl`에 저장한다. `requestId`를 Grafana 로그의
`request_id=<ID>`와 대조하고 `DB_REQUEST_TIMING`을 찾는다.
서버 `document_list`는 k6의 `pending_list`에 대응한다.
기존 Nginx가 응답에 전달하는 동일한 ID를 재사용하며 요청 ID를 지표 라벨로 추가하지 않는다.
status 0처럼 응답 헤더가 없으면 ID가 null이라 직접 연결하지 못할 수 있다.
클라이언트에서만 느리고 서버가 500ms 미만이면 기본 서버 진단 로그가 없을 수 있다.
그때는 Nginx 요청 로그를 먼저 보고, 필요하면 짧은 별도 실행에서 서버 임계값을 낮춘다.

## 음수 timing 정책

음수 receiving 등 세부 timing은 해당 시간 통계에서 제외하고 원본과 제외 수를 보존한다.
음수 세부 timing만으로 실행을 중단하거나 품질 실패로 판정하지 않는다.
정상 표본이 없으면 백분위는 null이다. 음수 전체 duration이나 비유한 값, 누락 지표,
dropped iteration, 실제 HTTP 오류는 기존 검증 기준을 유지한다.
따라서 기존 soak의 dropped iteration은 이 수정으로 통과가 되지 않는다.
