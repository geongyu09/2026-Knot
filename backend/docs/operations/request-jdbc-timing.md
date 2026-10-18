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

합계와 횟수는 64개를 넘어도 계속 센다. 상세 배열이 64개이고 총횟수가 더 크면 상세는 일부다.
SQL 원문, 바인드 값, 쿠키, 토큰, 요청/응답 본문을 추가 로그에 넣지 않는다.
SQL 해시는 JDBC SQL 문자열의 MD5이며 파라미터와 개인정보 복구용 식별자가 아니다.
기존 애플리케이션 로그 정책까지 변경하는 기능은 아니다.

SQL 시간은 연결 점유 시간의 일부이므로 세 시간을 더해 요청 시간으로 계산하지 않는다.
SQL execute가 짧고 usage가 길면 결과 순회, 트랜잭션 안의 다른 작업과 커밋/반환 등을 조사한다.
acquire만 길면 같은 시간 Hikari active/pending과 다른 요청의 usage를 대조한다.
이 값은 순수 PostgreSQL 실행 시간이 아니므로 EXPLAIN ANALYZE 결과와 동일시하지 않는다.

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
