# Prod 단일 EC2 Blue-Green 도입 계획

상태: 로컬 구현·집중 검증 및 Prod 사전 설정 완료; Issue #899 게시, PR 작성 중; 서비스 슬롯 전환·신규 배포 대기
확인일: 2026-10-21
대상: AWS Prod knot-backend-pipeline → knot-backend-build → knot-backend-deployment-group
작업 위치: 격리 worktree, origin/develop의 8deebdc44에서 시작
Issue/PR: [Issue #899](https://github.com/woowacourse-teams/2026-knot/issues/899) 생성 완료. 브랜치 `be/feature/#899`에서 PR을 준비 중이며, 이번 변경은 리뷰 대기까지만 진행하고 merge·운영 배포는 하지 않음.

## 1. 범위와 근거

Dev에서 검증한 Green 기동 → Health 확인 → Nginx 전환 → 이전 슬롯 drain 흐름을 Prod에 적용한다. Prod 슬롯 JVM은 요청대로 -Xmx256m으로 제한하되, Prod의 기존 환경 파일·기본 Spring 프로필·Nginx 설정·관측성 구성을 보존한다.

| 근거 | 관측 내용 | 적용 |
| --- | --- | --- |
| PR #895 / GitHub, 2026-10-21 | Dev Blue-Green drain 수정이 develop에 merge됨. main에는 아직 포함되지 않음. | Prod 기능은 develop에서 준비하고 운영 파이프라인은 main 반영 뒤 갱신 |
| Prod CodePipeline / AWS 콘솔, 2026-10-21 | knot-backend-pipeline 소스는 main; Build는 knot-backend-build. | CodeBuild inline buildspec도 별도로 맞춤 |
| Prod CodeBuild / AWS 콘솔, 2026-10-21 | 소스는 CodePipeline 입력, buildspec은 프로젝트 인라인 빌드 명령. Prod Blue-Green 파일 유무를 기준으로 기존 패키징과 Blue-Green 패키징을 선택하도록 인라인 설정 저장 완료. | 새 Prod 파일이 소스에 없으면 기존 패키징을 유지하고, Blue-Green marker가 있으면 prod-bluegreen 산출물을 생성. 저장만 했으며 빌드는 시작하지 않음 |
| Prod CodeDeploy / AWS 콘솔, 2026-10-21 | 기존 그룹은 in-place, AllAtOnce, Automatic Rollback 비활성. | 기존 그룹 유지, hook route 복구 사용. AWS 자동 롤백은 별도 검증 전 변경하지 않음 |
| Prod EC2 / SSH, 2026-10-21 | t4g.small, MaxHeapSize 약 460 MiB, 현재 JVM·Nginx·CodeDeploy active. 사전 설정 직전 available 592 MiB, 1 GiB Swap 중 232 MiB 사용. | Blue/Green 두 JVM을 상시 실행하지 않고, Swap을 2 GiB로 확장한 뒤 제한적 자원 관측 |
| Prod systemd / SSH, 2026-10-21 | knot-backend.service; knot-backend.env, recording-storage.env, recording-ai.env. drop-in에 SPRING_PROFILES_INCLUDE=observability, NMT summary, 90초 stop limit. active profile은 지정되지 않음. | Prod 슬롯에 같은 env files, observability include, NMT, 종료 제한 유지; active profile은 새로 지정하지 않음 |
| Prod Nginx·API / SSH 및 HTTP, 2026-10-21 | /etc/nginx/conf.d/knot-backend.conf upstream은 8080. 업로드 buffering off, proxy timeout 300초. https://api.knoted.kr/actuator/health는 200. | upstream만 교체하고 Prod 도메인으로 readiness 확인 |
| Prod Alloy / SSH, 2026-10-21 | host-network Alloy가 /opt/knot-observability-agent/config.alloy를 bind mount하고 Spring 8080을 직접 scrape. 127.0.0.1:12345/-/ready 응답. | loopback Nginx metrics route 18080으로 옮겨 Alloy 유휴 연결이 drain을 막지 않게 함 |
| Prod 사전 설정 / SSH, 2026-10-21 | Blue/Green systemd unit을 설치하고 daemon-reload함. 둘 다 inactive·disabled. 현재 운영 JAR를 Blue slot에 복사했으며 활성 JAR와 SHA-256이 동일함. | 슬롯 정의와 Blue 복구 기준을 미리 준비. 기존 서비스는 계속 8080에서 active |

## 2. 배포 흐름

CodePipeline main → CodeBuild inline buildspec → prod-bluegreen artifact → 기존 CodeDeploy 그룹 → BeforeInstall에서 legacy JAR 보존 → Blue를 -Xmx256m으로 복구 → Green 기동 및 200 UP 확인 → public/metrics Nginx route 전환 → Alloy metrics 확인 → 이전 포트 Nginx 연결 drain → 이전 슬롯 종료.

첫 Prod 전환은 이전 revision의 ApplicationStop이 현재 legacy 서비스를 정지시킬 수 있다. 새 revision은 ApplicationStop을 추가하지 않고 BeforeInstall에서 JAR를 보존한 뒤 ApplicationStart에서 Blue와 Green을 준비한다. 최초 전환에는 짧은 중단이 발생할 수 있으므로 실제 배포는 진행 중인 녹음이 없는 시간에 수행한다.

후보 Health, metrics, Nginx reload, route 검증 또는 drain이 실패하면 hook이 이전 Nginx route를 복구한다. route 복구가 불확실하면 두 프로세스를 보존하고 다음 배포를 막는다. Flyway migration 파일 집합이 달라지면 배포를 거부한다.

## 3. 변경 파일과 책임

| 파일 | 변경 |
| --- | --- |
| backend/scripts/bluegreen_deploy.sh | Dev/Prod 공유 전환·readiness·route 복구·Alloy metrics·Nginx drain 로직 |
| backend/scripts/{dev,prod}_bluegreen_deploy.sh | 환경별 group, Nginx path, Health host wrapper |
| backend/scripts/bluegreen_preserve_legacy.sh 및 wrapper | CodeDeploy 기존 JAR 정리 전에 Blue slot용으로 보존 |
| backend/appspec-prod-bluegreen.yml | Prod BeforeInstall/ApplicationStart hook. 신규 ApplicationStop과 app.jar 덮어쓰기 없음 |
| backend/ops/systemd/prod/knot-backend-{blue,green}.service | Prod env files·observability·NMT·90초 stop 유지, -Xmx256m, 포트 8080/8081 |
| backend/ops/nginx/knot-backend-metrics.conf | loopback 18080에서만 actuator/prometheus 전달 |
| backend/ops/codebuild/package-deployment-artifact.sh, buildspec.yml | prod-bluegreen일 때 Prod AppSpec·unit·metrics만 패키징; legacy 기본값 유지 |
| backend/scripts/tests/ | Dev 회귀와 Prod group·health host·unit·artifact 분리 검증 |
| docs/implement-plan/prod-blue-green-deployment.md | 구현 근거, 제한, 적용 순서 기록 |

Java 애플리케이션 코드와 DB schema는 변경하지 않는다.

## 4. TDD와 검증

1. Prod packaging fixture를 먼저 추가하고, Prod AppSpec·slot unit·metrics 설정이 포함되는지 확인한다. legacy mode 출력은 유지한다.
2. 공통 fixture로 Prod wrapper가 Prod 배포 그룹과 api.knoted.kr readiness, Nginx/Alloy route를 쓰는지 확인한다.
3. 후보 실패·전환 실패·drain timeout에서 이전 route와 서비스가 보존되는지 Prod에서도 확인한다.
4. bash -n, AppSpec/buildspec YAML parse, package fixture, Dev·Prod fixture, git diff --check를 실행한다.
5. Java 코드는 바꾸지 않으므로 Gradle Java 테스트는 실행하지 않는다. fixture 결과와 실제 CodeDeploy는 별도로 기록한다.

## 5. 운영 적용 및 완료 기준

- Prod CodeBuild inline buildspec은 marker 기반으로 사전 설정했다. 새 Prod Blue-Green 파일이 아직 소스에 없으면 기존 `app.jar`·AppSpec 패키징을 유지하고, 파일이 소스에 포함되면 `prod-bluegreen` 패키징을 선택한다. 설정 저장만 했고 CodeBuild/CodePipeline을 시작하지 않았다.
- 기존 knot-backend-deployment-group을 계속 사용한다.
- 현재 운영 `knot-backend.service`와 Nginx 8080 upstream은 유지한다. Blue/Green unit은 설치만 했고 비활성·비활성화 상태이며, Green을 기동하거나 Nginx upstream을 미리 바꾸지 않았다. Nginx metrics route 18080은 아직 활성화하지 않았다.
- 1 GiB `/swapfile-bluegreen`을 추가하고 `/etc/fstab`에 등록해 총 Swap을 2 GiB로 구성했다. 적용 직후 전체 Swap 사용량은 약 242 MiB였고, 기존 서비스 health는 HTTP 200이었다.
- 현재 `/opt/knot-backend/app.jar`를 `/opt/knot-backend/slots/blue/app.jar`에 복사했다. 두 파일 SHA-256은 `38886f60f819a1d3ec772393d3bb213833fba0dbb3b43034f7ab9d53138ac366`로 일치한다. Green 슬롯 디렉터리도 만들었으나 JAR는 아직 없다.
- 기존 Nginx route는 8080이고 8081·18080 listener는 없다. 후보가 건강해지기 전에는 프록시를 미리 Green으로 돌리지 않는다.
- 첫 CodeDeploy에서 이전 revision의 `ApplicationStop`이 legacy 서비스에 영향을 줄 가능성은 사라지지 않는다. 현재처럼 legacy 서비스가 계속 운영 중인 상태에서 unit/JAR만 미리 준비하는 것으로 첫 hook 중단 구간을 제거할 수 없다. 완전한 사전 이행은 별도 무녹음 시간에 현재 서비스를 Blue-Green service로 옮기고 Nginx drain을 확인해야 한다.
- 첫 실제 배포 전 기존 JAR와 Nginx 설정을 보존하고 Health 200, JVM flags, Nginx route, Alloy metrics, CPU/memory/Swap을 확인한다.
- 첫 운영 배포는 활성 녹음이 없는 시간에 수행한다. 이전 legacy 서비스 종료로 짧은 중단이 가능하다.
- Green 200 UP, public route Health 200, metrics 수신, Blue drain 뒤 종료, 실제 녹음 종료 및 오디오 저장을 확인한다.
- route rollback과 AWS Automatic Rollback은 별도 검증이다. 현재 AWS 자동 롤백은 비활성이므로 이번 변경에서 켜지 않는다.
- Dev의 제한 측정에서는 두 256 MiB JVM 실행 중 available memory 최저 223 MiB와 Swap 증가가 있었다. Prod의 전체 Worker 지속 부하는 미검증이다. 자원 압박이 크면 전환을 중단하고 Swap/인스턴스 구성 재검토를 후속 처리한다.

## 6. 로컬 구현 검증 결과

- `python3 backend/scripts/tests/test_dev_bluegreen_deploy.py`: 32개 fixture 통과. 기존 Dev hook/실패복구 케이스와 Prod group·health host·unit 설정·패키징 경로를 함께 검증함.
- `bash -n`으로 공통 hook, Dev/Prod wrapper 및 패키징 스크립트 구문 통과.
- Ruby Psych YAML parser로 legacy/Dev/Prod AppSpec 및 저장소 buildspec 구문 통과.
- `git diff --check` 통과.
- AWS CodeBuild 인라인 buildspec을 marker 기반 하위 호환 방식으로 저장함. AWS 콘솔에서 성공 알림 확인; CodeBuild/CodePipeline 실행은 하지 않음.
- EC2에 1 GiB Swap 추가, Blue/Green unit 설치 및 daemon-reload, Blue 슬롯 JAR 복사를 수행함. Blue/Green은 모두 inactive·disabled이며 기존 Spring 서비스, Nginx route, Alloy 설정은 바꾸지 않음.
- CodeDeploy 설정과 Nginx 설정은 변경하지 않음. 따라서 실제 Prod 배포 및 첫 전환은 미검증.

Prod 전용 [Issue #899](https://github.com/woowacourse-teams/2026-knot/issues/899)를 생성했고 `docs/adr/899-prod-single-ec2-bluegreen-deployment.md`를 Proposed 상태로 추가했다. 이번 PR은 `develop`을 대상으로 리뷰 대기까지만 진행한다. CodeBuild·CodePipeline·CodeDeploy 실행과 Prod 서비스 전환은 하지 않는다. 첫 Prod 적용은 이전 revision의 `ApplicationStop`이 legacy 서비스를 중지할 수 있으므로, 무녹음 시간에 사전 Blue-Green handoff를 할지 첫 배포의 짧은 중단을 허용할지는 운영 배포 전 별도 확인한다.
