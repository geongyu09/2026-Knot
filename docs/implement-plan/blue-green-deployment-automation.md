# Dev 단일 EC2 Blue-Green 자동 배포 계획

상태: Dev CodeDeploy drain timeout 원인 수정 및 로컬 fixture 검증 완료, 수정 revision 재배포 대기
확인일: 2026-10-21
대상: `knot-backend-dev` 단일 EC2, CodeDeploy EC2/On-Premises 배포
현재 브랜치: `be/bugfix/#871`

## 1. 범위와 근거

현재 Dev에서 수동으로 확인한 Green 기동, Health Check, Nginx 전환, 기존 요청 drain을 CodeDeploy lifecycle hook으로 반복 가능하게 만든다. 사용자는 기존 `knot-backend-dev-deployment-group`을 재사용하기로 결정했다. 첫 이행에서는 직전 revision의 `ApplicationStop`이 `knot-backend.service`를 중지할 수 있으며, 이 짧은 중단은 허용한다. 새 revision의 `BeforeInstall`에서 현재 JAR를 Blue slot에 보존하고 `ApplicationStart`에서 Blue를 다시 준비한 뒤 Green을 기동한다.

| 근거 | 확인한 사실 | 분류 |
| --- | --- | --- |
| `backend/appspec.yml`, `backend/scripts/*.sh` | 기존 artifact는 JAR를 `/opt/knot-backend/app.jar`에 복사하고 `ApplicationStop`에서 기존 서비스를 중지한다. | 저장소 구현 관측 |
| `buildspec.yml`, `backend/ops/codebuild/README.md` | CodeBuild artifact에는 루트 `app.jar`, `appspec.yml`, `scripts/`가 들어간다. Dev 프로젝트는 inline buildspec이므로 저장소 buildspec만 수정해도 AWS 설정은 바뀌지 않는다. | 저장소 구현 관측 |
| `docs/operations/aws-dev-and-prod-environments.md` | Dev는 `develop` 파이프라인, CodeDeploy `knot-backend-dev`와 `knot-backend-dev-deployment-group`을 사용한다. | 운영 기록 |
| Dev CodeDeploy 콘솔 (2026-10-20) | 기존 그룹은 EC2/온프레미스, 현재 위치 배포, `AllAtOnce`, automatic rollback 비활성, 태그 `Name=knot-backend-dev`다. | AWS 콘솔 관측 |
| Dev EC2 SSH 읽기 (2026-10-20) | 직전 관측에서는 `knot-backend.service`가 8080에서 active였고 Nginx upstream도 8080이었다. 종료 제한은 90초다. | 실제 호스트 관측 |
| CodeDeploy `d-LDPC9VU69` (2026-10-20) | Green health와 Nginx 전환은 성공했지만 port 8080의 ESTABLISHED 연결 하나가 900초 동안 남아 drain이 실패했다. 롤백 뒤 Blue active, Green 중지, Nginx 8080, 공개 Health HTTP 200을 확인했다. | 실제 배포 관측 |
| Dev EC2 Alloy/Nginx SSH 읽기 (2026-10-21) | Alloy는 host-network Docker container에서 Spring을 `127.0.0.1:8080`으로 직접 scrape했다. 남은 client socket 소유자는 `alloy`였고, Nginx는 `conf.d/*.conf`를 읽으며 loopback 18080은 사용하지 않았다. | 실제 호스트 관측 |
| CodeDeploy `d-BRQ7SCPGL` (2026-10-20) | merge commit `2832dd96aa5148b02bcf018f40dac5d28241eba2`이 기존 그룹에 성공적으로 배포됐지만 in-place 방식이었다. 사후 확인에서 Java는 8080 하나만 열고 Blue/Green 전환은 없었다. Health는 HTTP 200, 응답 약 0.60초였다. | 실제 배포 관측 |
| CodeDeploy 공식 문서 | `ApplicationStop`은 직전 성공 revision의 스크립트를 실행한다. 실패 시 자동 롤백은 직전 정상 revision을 새 배포로 다시 설치한다. | 외부 기술 근거 |
| `docs/product/current-v2-mvp.md`, `backend/docs/notion-context.md` | 배포 자동화에 적용할 별도 제품 동작 계약은 없다. 이 변경은 운영·배포 구조 변경이다. | 적용 범위 확인 |

`d-LDPC9VU69`는 기존 그룹에서 Blue-Green hook을 실행했다. Green 준비와 Nginx health 검증은 통과했으나, 모든 ESTABLISHED socket을 요청으로 간주한 drain이 Alloy의 유휴 scrape 연결 때문에 15분 뒤 실패했다. hook rollback은 Blue를 복구했다. 이번 수정은 Alloy를 활성 slot을 따라가는 loopback Nginx metrics endpoint로 옮기고, drain은 Nginx 소유의 이전 slot 연결만 세도록 바꾼다. 로컬 검증은 수정 revision의 Dev 재배포 성공을 뜻하지 않는다.

## 2. 구현할 흐름

`develop` → Dev CodeBuild가 `DEPLOYMENT_MODE=dev-bluegreen`으로 전용 artifact 생성 → 기존 `knot-backend-dev-deployment-group` 배포 → 첫 이행 때 직전 revision의 `ApplicationStop`이 legacy를 중지할 수 있음 → 새 `BeforeInstall` hook이 legacy JAR를 Blue slot에 보존 → 새 `ApplicationStart` hook이 필요하면 Blue를 8080에서 복구 → 비활성 slot에 새 JAR 복사 → 후보 readiness 확인 → public Nginx upstream과 loopback metrics upstream을 새 slot으로 함께 전환 → Health 및 JVM metrics 검증 → Alloy는 안정 endpoint `127.0.0.1:18080`에서 scrape → 이전 slot의 Nginx upstream 연결 drain → 이전 서비스 종료. 기존 `appspec.yml`과 Prod artifact 기본 동작은 유지한다.

Dev Blue-Green AppSpec에는 `files` 섹션과 `ApplicationStop` hook을 두지 않는다. `BeforeInstall`은 직전 revision의 `ApplicationStop`과 CodeDeploy 파일 정리 이후에도 쓸 수 있도록 `/opt/knot-backend/app.jar`를 `/opt/knot-backend/slots/blue/app.jar`에 보존한다. 보존 JAR가 이미 있고 legacy JAR가 정리된 재시도에서는 기존 보존본을 사용한다. `ApplicationStart`는 기존 그룹 이름을 확인하고, Nginx가 8080을 가리키는데 legacy/Blue 서비스가 모두 내려가 있으면 Blue systemd unit을 설치·기동해 포트 8080의 health를 확인한다. 그 뒤 기존 활성 슬롯과 반대인 포트에 신규 JAR를 배치한다. Prod artifact의 기존 동작은 유지한다.

실패 분기는 다음과 같다.

- 후보 기동 또는 readiness 실패: Nginx를 바꾸지 않고 기존 Blue를 유지한다.
- Nginx 문법 검사·reload·전환 후 Health 또는 metrics 검증 실패: public route와 loopback metrics route를 기존 Blue로 복구한다. Alloy 설정은 loopback endpoint를 유지하는 additive 변경이다. 설정 해시가 성공적으로 적용된 뒤에는 불필요한 reload를 생략하고, reload 실패 또는 Alloy 비준비 상태에서는 marker를 갱신하지 않아 다음 배포에서 재시도한다. route 복구를 확인할 수 없으면 두 프로세스를 모두 유지한다.
- 이전 Blue drain: `ss -Htnp`로 이전 포트의 client-side 연결 중 Nginx 소유 upstream 연결만 세고, 0이 될 때까지 최대 900초 기다린다. Alloy는 Blue 포트에 직접 연결하지 않는다. 제한 시간 내 drain되지 않으면 두 route를 복원하고 Green에 남은 연결이 있으면 Green을 종료하지 않는다.
- 전환 검증 성공 뒤 이전 Blue 종료: Spring graceful shutdown에 90초까지 기다린다. 종료 전 route Health와 이전 연결 0을 확인한다.
- CodeDeploy hook 실패: 기존 그룹의 automatic rollback은 마지막 관측 시 비활성이다. hook 자체가 Green 준비·Nginx 전환·drain 실패를 처리해 기존 route를 복원한다. 최초 이행 중 Blue bootstrap이 실패하면 보존 JAR로 legacy 서비스를 먼저 복구하고, legacy 기동도 실패하면 Blue slot 재기동을 시도한다. AWS-level 이전 revision 재배포는 별도 설정과 실배포 검증이 필요하다.

DB migration은 이 자동화에서 처리하지 않는다. 두 버전이 함께 실행되는 동안 양쪽 버전과 호환되는 expand 단계만 허용하고, 파괴적 contract migration은 별도 배포로 분리한다.

## 3. 코드 위치와 책임

| 위치 | 변경 책임 |
| --- | --- |
| `backend/appspec.yml` | 기존 in-place/Prod artifact 동작을 유지한다. |
| `backend/appspec-dev-bluegreen.yml` | Dev 전용 `BeforeInstall` 보존 hook과 `ApplicationStart` orchestrator를 선언한다. `files` 덮어쓰기와 새 `ApplicationStop`은 두지 않으며 기존 배포 그룹을 대상으로 한다. |
| `buildspec.yml`, `backend/ops/codebuild/package-deployment-artifact.sh` | 기본값은 기존 artifact를 유지하고, `DEPLOYMENT_MODE=dev-bluegreen`일 때만 Dev 전용 AppSpec, unit 파일과 loopback metrics Nginx 설정을 패키징한다. AWS Dev 프로젝트가 inline buildspec을 사용하는 경우 저장소 파일과 별도로 동기화해야 한다. |
| `backend/scripts/dev_bluegreen_preserve_legacy.sh` | 기존 배포 그룹과 현재 route를 확인하고 CodeDeploy 설치 단계 전에 legacy JAR를 Blue slot에 원자적으로 보존한다. |
| `backend/scripts/dev_bluegreen_deploy.sh` | 배포 그룹·현재 Nginx upstream·활성 service·migration 파일 집합을 확인한다. 최초 이행에서 Blue를 복구한 뒤 비활성 slot 설치·기동·readiness, public/metrics Nginx route 전환, Alloy config reload, Nginx 연결 drain, service enable/disable·종료와 route rollback을 수행한다. 설정 해시가 적용되지 않았을 때만 Alloy를 reload하고, 성공한 해시는 상태 파일에 기록한다. |
| `backend/ops/nginx/knot-backend-dev-metrics.conf`, `backend/ops/observability/agent/config.alloy` | Spring metrics를 외부에 공개하지 않고 loopback Nginx port 18080으로 수집하며, port 8080의 고정 scrape 연결을 없앤다. |
| `backend/ops/systemd/knot-backend-{blue,green}.service` | Dev 두 slot을 별도 JAR 경로·포트로 실행한다. 실제 Dev unit의 환경 파일·프로파일, `-Xmx256m`, 90초 종료 제한을 반영한다. |
| `backend/scripts/tests/test_dev_bluegreen_deploy.py` | 임시 fixture와 가짜 systemd/Nginx/curl/ss/jar 명령으로 package 선택, JAR 보존, 첫 Blue bootstrap, 최상위 health 상태, 성공·실패·복구·slot 교대 흐름을 검증한다. 실제 서비스는 건드리지 않는다. |

DB schema와 Java API는 변경하지 않는다.

## 4. TDD와 검증 순서

| 순서 | 실패 테스트 → 최소 구현 | 기대 결과 |
| --- | --- | --- |
| 1 | 배포 artifact package mode를 분리하고 fixture로 확인한다. | 기존 모드는 기존 AppSpec을 유지하고 Dev 모드만 Green AppSpec, unit 파일과 metrics config를 포함한다. |
| 2 | migration 집합 변경·비활성 slot 선택·후보 Health 실패 fixture로 hook 경계를 확인한다. | migration 집합이 다르거나 후보가 준비되지 않으면 기존 Blue와 Nginx를 건드리지 않는다. |
| 3 | Nginx와 metrics proxy 검증/reload 실패 fixture로 public route, metrics route 복구와 Alloy 설정 reload 상태를 확인한다. | route 복구가 확인되지 않으면 두 프로세스를 보존한다. |
| 4 | Alloy의 유휴 연결과 Nginx의 진행 중 upstream 연결을 분리해 drain fixture를 실행한다. | Alloy 연결은 drain을 막지 않고, 이전 slot의 Nginx upstream 연결은 남아 있는 동안 drain을 막는다. |
| 5 | 성공과 slot 교대 fixture를 실행한다. | Green `200 UP`과 JVM metrics 확인 후 route를 바꾸고, 이전 Nginx upstream 연결이 0이 된 후 이전 서비스를 종료한다. |
| 6 | shell 구문·artifact packaging·diff 검사를 수행한다. | Dev artifact에 loopback metrics config가 포함되고 legacy artifact에는 포함되지 않는다. |

로컬 검증(2026-10-21): `python3 backend/scripts/tests/test_dev_bluegreen_deploy.py -v`에서 기존 22개 회귀 케이스와 추가 4개 회귀 케이스를 포함해 26개가 통과했다. Alloy 연결만 있는 경우 배포 성공, Nginx upstream 연결이 남아 있는 경우 배포 실패와 Blue 복구, metrics 검증 실패 뒤 route 복구, Alloy reload 실패 후 다음 배포에서 재시도, 변경 없는 Alloy 설정의 reload 생략, Dev/legacy artifact 분리를 검사한다. fixture는 fake systemd/Nginx/curl/ss/jar를 사용하므로 실제 EC2 배포 동작을 입증하지 않는다.

## 5. 완료 기준과 다음 작업

- 기존 그룹의 첫 Blue-Green 배포에서 기존 `ApplicationStop`에 따른 짧은 중단을 허용한다. `BeforeInstall`이 기존 JAR를 보존하고 새 hook이 Blue를 복구한 뒤 Green을 준비한다.
- Health 실패·Nginx 실패 시 이전 upstream이 유지되거나 복원되고 Blue가 active인 상태가 확인된다.
- 성공 시 진행 중인 Nginx upstream 연결 drain 후 이전 프로세스가 종료되고 신규 slot이 public 요청과 Alloy scrape를 모두 받는다.
- Prod의 기존 배포 흐름을 변경하지 않고 유지한다.
- 기존 Dev CodeDeploy 배포 그룹과 pipeline이 사용된 것은 최근 `d-LDPC9VU69`에서 확인했다. 이 PR의 수정 revision은 merge 후 동일 pipeline 배포에서 확인해야 한다.
- CodeDeploy automatic rollback은 현재 꺼져 있다. route를 hook에서 복구하는 테스트와 AWS automatic rollback으로 이전 revision을 재배포하는 테스트는 구분한다.
- GitHub Issue #871 본문은 아직 별도 그룹 사용을 요구한다. 이 구현과 ADR은 사용자가 2026-10-20에 지시한 기존 그룹 재사용 선택을 반영하며, Issue 본문 동기화는 원격 쓰기 권한이 확인될 때 수행한다.

별도 미검증: 운영 부하에서 자원 headroom, 자동 배포 3회 반복 요청 실패율, 실제 Green 장애 뒤 AWS automatic rollback. 동일 EC2 동시 실행에서 available memory가 234~265 MiB까지 감소한 이전 측정이 있으므로 첫 자동 배포는 요청·녹음 관측을 함께 수행한다.

로컬 수정과 fixture 검증은 실제 Dev 재배포 검증과 구분한다. CodeBuild 프로젝트, CodePipeline action, CodeDeploy 그룹과 Dev EC2는 이 변경에서 직접 수정하지 않는다. merge 후 pipeline 배포에서 Alloy scrape가 loopback metrics route를 따라가고, Nginx upstream drain 뒤 Blue가 종료되는지 확인해야 한다. Nginx route 복구를 확인할 수 없는 실패에서는 `/var/lib/knot-backend-deploy/blue-green/route-uncertain` marker가 남고 후속 배포를 거부한다.

공식 근거: [CodeDeploy lifecycle hook 동작](https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file-structure-hooks.html), [CodeDeploy 롤백 동작](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-steps-server.html).
