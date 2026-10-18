# #810 운영 AI 수집 연결 검증

2026-10-18 로컬 검증. 기준 develop `ae9f59ca`, 브랜치 `be/chore/#810`.
운영 AI·Mac 수집기·중앙 Grafana에는 이번 변경을 적용하지 않았다.

## 요구사항과 증거

| 요구사항 | 변경·검증 근거 | 상태 |
| --- | --- | --- |
| 기존 수집기에 service 추가 | `connect_service.py`, host 설정 보존·중복 실행 검사 | 충족 |
| 적용 전 인증·지표·파일 검사 | 실제 loopback HTTP 서버로 401/200·오류·redirect·크기·계약·권한 검사 | 충족 |
| 원자 교체·실패 복구 | 임시 디렉터리 실제 파일 교체, 재시작 실패·준비 실패·복구 실패·동시 실행·외부 변경 검사 | 충족 |
| service 화면 기본값 | 기존 dashboard UID·쿼리·NoData 규칙 보존, 기본값 계약·PromQL 평가 | 충족 |
| 선행 AI 계측 검토 | #782 HEAD `e978cf9a`의 인증·상태·단계 구현 검토 및 관련 테스트 40건 | 충족 |
| 운영 적용·복구 절차 | `mac-ai-service.md`에 유휴 배포·중앙 표본·작업 상태·재시작·로그인 경계 | 문서 충족, 운영 미실행 |

## 실행한 검사

backend 디렉터리에서 실행했다.

```sh
python3 -m unittest discover -s ops/observability/mac/ai -p 'test_*.py' -v
python3 -m unittest discover ../.github/scripts -p 'test_*.py' -v
./gradlew spotlessCheck test integrationTest acceptanceTest bootJar --continue
```

- AI 수집: 22건 통과. 신규 연결 검사 15건, 기존 화면·모듈 계약 6건, 실제 pinned
  Prometheus의 PromQL 평가 1건이다. HTTP는 로컬 서버, launchctl·Alloy 실행/준비 응답은 대역이다.
- 실제 Alloy: 생성된 host+service 후보를 `grafana/alloy:v1.20.1` 컨테이너의 `validate`로 검사해
  exit 0을 확인했다. 임시 설정과 테스트 토큰만 읽기 전용 mount, `--network none`으로 실행했다.
  실제 Mac 프로세스 시작·중앙 전송 검증은 아니다.
- Governance: 10건 통과.
- Gradle: 5분 26초 성공. 단위 1,717·통합 773·인수 586건, 실패·오류 0이다.
  통합 중 실제 S3 opt-in 1건은 생략됐다. 포맷 검사·bootJar도 통과했다.

AI 선행 PR의 별도 checkout `ai-server`에서 실행했다.

```sh
./gradlew spotlessCheck test \
  --tests '*TranscriptionMetrics*' \
  --tests '*TranscriptionJobServiceTest' \
  --tests '*HeadlessTranscriptionEngineTest' \
  --tests '*TranscriptionLoggingTest' bootJar
```

40건 실행, 실패·오류·생략 0, 25초 성공. 실제 모델을 실행하는 운영 전사 시험은 아니다.

## 선행 PR 검토 결과

#751 → #752 → #782는 확인 시점 OPEN·승인 상태이며 이번 PR에서 병합하지 않았다.
별도 상위·하위 이슈 연결이 없는 #810을 직접 연결한다.

- `/internal/metrics`는 기존 `AppAuthenticationFilter`와 `AI_APP_TOKEN`을 사용한다.
  지표 전용 권한이 아니므로 연결 문서에 작업 API 접근 권한도 가진다는 점을 명시했다.
- ready는 accepting·엔진 준비 상태이고 active_jobs는 실제 worker 존재 여부다.
  ready=1과 busy=1이 함께 있을 수 있으며 readiness를 유휴 판정으로 사용하지 않는다.
- download/decode/model/result_check/cleanup의 고정 단계와 completed/failed 결과만 라벨에 쓴다.
  작업 ID·입력·전사 본문·토큰은 지표에 넣지 않는다.
- 시간은 단조 시계를 사용한다. 작업 종료와 정리 후 슬롯 해제 시 최종 집계하며,
  같은 ID 재요청과 busy 거절을 새 완료 작업으로 집계하지 않는다.
- collector 재시작과 AI 프로세스 재시작을 구분한다. AI 프로세스 재시작은 누적값을 초기화한다.

## 컨벤션과 검증 경계

원문 00~08 hash 검사는 통과했다. 공통 검증 wrapper는 변경 범위 감사에서 기존
build.gradle LIB-VERSION 3건, 전체 감사에서 1,229건으로 실패해 Gradle 전에 종료됐다.
진단 대상 305개 파일을 `origin/develop`과 byte 비교했고 모두 동일했다.
직접 실행한 Gradle 성공으로 컨벤션 감사 실패를 통과 처리하지 않는다.

| 규칙군 | 검토 결과 |
| --- | --- |
| STACK·LIB | 기존 Alloy·Prometheus 사용, 새 라이브러리 없음 |
| LAYER·MODEL·API·DB·JAVA | Spring·업무 API·DB·Java 코드는 변경하지 않음 |
| TEST | HTTP 경계·파일 변경·멱등성·실패 복구·PromQL을 관찰, 대역 범위를 명시 |
| AI | 비밀값 출력 제외, 운영/로컬 검증 분리, 권한 확대 없음 |
| DELIVERY | #810 계약, develop 기준 분기, Issue→PR, 운영 완료와 코드 완료 구분 |

Mac SSH는 현재 작업 환경에서 인증되지 않아 운영 파일을 읽거나 변경하지 않았다.
LaunchAgent 실제 재시작, service 중앙 새 표본, 실제 작업→결과 저장, 로그인 전 자동 복구는
미검증이다. 후자는 사용자 결정도 아직 남아 있다. 운영 적용은 [runbook](../operations/mac-ai-service.md)의
완료 체크리스트를 따라 별도로 기록한다. 임계값·알림·AI 전용 사용 조건의 기준선 측정은 후속 범위다.
