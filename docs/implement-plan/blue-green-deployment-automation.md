# Dev 단일 EC2 Blue-Green 자동 배포 계획

상태: 로컬 구현 완료, Dev AWS 연결·실배포 전
확인일: 2026-10-20
대상: `knot-backend-dev` 단일 EC2, CodeDeploy EC2/On-Premises 배포
현재 브랜치: `be/feature/#871`

## 1. 범위와 근거

현재 Dev에서 수동으로 확인한 Green 기동, Health Check, Nginx 전환, 기존 요청 drain을 CodeDeploy lifecycle hook으로 반복 가능하게 만든다. Dev 배포에는 기존 CodeDeploy 배포 그룹을 그대로 쓰지 않는다. 이 그룹에는 이전 성공 revision이 있으므로 새 revision을 적용할 때 이전 revision의 `ApplicationStop`이 먼저 실행될 수 있다. 현재 그 스크립트는 `knot-backend.service`를 즉시 중지한다. 별도의 신규 Dev 배포 그룹을 만들어 첫 revision으로 전환하고, 그 그룹을 대상으로 배포하는 경로를 마련한다.

| 근거 | 확인한 사실 | 분류 |
| --- | --- | --- |
| `backend/appspec.yml`, `backend/scripts/*.sh` | 기존 artifact는 JAR를 `/opt/knot-backend/app.jar`에 복사하고 `ApplicationStop`에서 기존 서비스를 중지한다. | 저장소 구현 관측 |
| `buildspec.yml`, `backend/ops/codebuild/README.md` | CodeBuild artifact에는 루트 `app.jar`, `appspec.yml`, `scripts/`가 들어간다. Dev 프로젝트는 inline buildspec이므로 저장소 buildspec만 수정해도 AWS 설정은 바뀌지 않는다. | 저장소 구현 관측 |
| `docs/operations/aws-dev-and-prod-environments.md` | Dev는 `develop` 파이프라인, CodeDeploy `knot-backend-dev`와 `knot-backend-dev-deployment-group`을 사용한다. | 운영 기록 |
| Dev CodeDeploy 콘솔 (2026-10-20) | 기존 그룹은 EC2/온프레미스, 현재 위치 배포, `AllAtOnce`, 자동 롤백 비활성, 태그 `Name=knot-backend-dev`다. | AWS 콘솔 관측 |
| Dev EC2 SSH 읽기 (2026-10-20) | `knot-backend.service`가 `8080`에서 active, Nginx upstream은 `/etc/nginx/conf.d/knot-backend-dev.conf`의 `127.0.0.1:8080`이다. 서비스 종료 제한은 90초이며, 추가 설정 파일 `/etc/knot-backend/recording-streaming.properties`는 `ubuntu` 사용자가 읽을 수 있다. | 실제 호스트 관측 |
| CodeDeploy 공식 문서 | `ApplicationStop`은 직전 성공 revision의 스크립트를 실행한다. 실패 시 자동 롤백은 직전 정상 revision을 새 배포로 다시 설치한다. | 외부 기술 근거 |
| `docs/product/current-v2-mvp.md`, `backend/docs/notion-context.md` | 배포 자동화에 적용할 별도 제품 동작 계약은 없다. 이 변경은 운영·배포 구조 변경이다. | 적용 범위 확인 |

AWS CLI에는 현재 credentials가 없어 읽기 작업이 실패했다. CodeDeploy와 CodePipeline 설정은 콘솔에서 읽었으며, 신규 배포 그룹 생성 및 파이프라인 수정은 아직 하지 않았다. 기존 배포 그룹을 수정하거나 Dev 파이프라인을 새 revision 없이 전환하지 않는다.

## 2. 구현할 흐름

`develop` → Dev CodeBuild가 `DEPLOYMENT_MODE=dev-bluegreen`으로 전용 artifact 생성 → 신규 Blue-Green Dev 배포 그룹 → 비활성 slot에 새 JAR 복사 → 별도 systemd 서비스 기동 → 직접 readiness 확인 → Nginx upstream 원자적 변경 및 검증 → 기존 Blue 요청 drain → 이전 서비스 종료. 기존 `appspec.yml`과 Prod 배포 동작은 유지한다.

Dev Blue-Green AppSpec은 활성 JAR 경로에 파일을 직접 복사하지 않는다. Hook은 현재 CodeDeploy revision archive의 JAR를 읽고 `/opt/knot-backend/slots/blue/` 또는 `/opt/knot-backend/slots/green/` 아래 비활성 slot에 배치한다. 현재 활성 slot과 Nginx 설정은 전환 전후 검증에 사용한다. Prod 그룹은 기존 in-place 동작을 유지한다. Hook 자체의 배포 그룹 이름 확인은 방어 검사이며, 기존 그룹의 이전 `ApplicationStop`보다 먼저 실행되지 않는다. Blue 보호 조건은 새 그룹을 대상으로 지정하는 것이다.

실패 분기는 다음과 같다.

- 후보 기동 또는 readiness 실패: Nginx를 바꾸지 않고 기존 Blue를 유지한다.
- Nginx 문법 검사·reload·전환 후 Health Check 실패: 이전 Nginx 설정을 복구하고 기존 Blue를 유지 또는 재기동한다. route 복구를 확인할 수 없으면 두 프로세스를 모두 유지한다.
- 이전 Blue drain: 기존 포트의 ESTABLISHED upstream 연결이 0이 될 때까지 최대 900초 기다린다. 제한 시간 내 drain되지 않으면 이전 route를 복원하고 Green에 남은 연결이 있으면 Green을 종료하지 않는다.
- 전환 검증 성공 뒤 이전 Blue 종료: Spring graceful shutdown에 90초까지 기다린다. 종료 전 route Health와 이전 연결 0을 확인한다.
- CodeDeploy 실패: 배포 그룹 automatic rollback으로 이전 정상 revision을 재배포한다. 첫 신규 그룹 배포에서 실패하면 자동으로 재배포할 정상 revision이 없으므로 이전 legacy Blue가 계속 응답해야 한다.

DB migration은 이 자동화에서 처리하지 않는다. 두 버전이 함께 실행되는 동안 양쪽 버전과 호환되는 expand 단계만 허용하고, 파괴적 contract migration은 별도 배포로 분리한다.

## 3. 코드 위치와 책임

| 위치 | 변경 책임 |
| --- | --- |
| `backend/appspec.yml` | 기존 in-place/Prod artifact 동작을 유지한다. |
| `backend/appspec-dev-bluegreen.yml` | Dev 전용 hook만 선언한다. `files` 덮어쓰기와 `ApplicationStop`을 사용하지 않고, 기존 배포 그룹을 대상으로 한 실행도 hook에서 거부한다. |
| `buildspec.yml`, `backend/ops/codebuild/package-deployment-artifact.sh` | 기본값은 기존 artifact를 유지하고, `DEPLOYMENT_MODE=dev-bluegreen`일 때만 Dev 전용 AppSpec과 unit 파일을 artifact에 패키징한다. AWS Dev 프로젝트 inline buildspec은 저장소 buildspec을 사용하도록 별도 갱신이 필요하다. |
| `backend/scripts/dev_bluegreen_deploy.sh` | 배포 그룹·현재 Nginx upstream·활성 service·migration 파일 집합 확인, 비활성 slot 설치·기동·readiness, Nginx 원자적 전환, 이전 연결 drain, 서비스 enable/disable·종료, 모든 중간 실패의 라우트 복구를 한 lifecycle hook에서 수행한다. |
| `backend/ops/systemd/knot-backend-{blue,green}.service` | Dev 두 slot을 별도 JAR 경로·포트로 실행한다. 실제 Dev unit의 환경 파일·프로파일, `-Xmx256m`, 90초 종료 제한을 반영한다. |
| `backend/scripts/tests/test_dev_bluegreen_deploy.py` | 임시 fixture와 가짜 systemd/Nginx/curl/ss/jar 명령으로 package 선택, 최상위 health 상태, 성공·실패·복구·slot 교대 흐름을 검증한다. 실제 서비스는 건드리지 않는다. |

DB schema와 Java API는 변경하지 않는다.

## 4. TDD와 검증 순서

| 순서 | 실패 테스트 → 최소 구현 | 기대 결과 |
| --- | --- | --- |
| 1 | 배포 artifact package mode를 분리하고 fixture로 확인한다. | 기존 모드는 기존 AppSpec을 유지하고 Dev 모드만 Green AppSpec과 unit 파일을 포함한다. |
| 2 | migration 집합 변경·비활성 slot 선택·후보 Health 실패 fixture로 hook 경계를 확인한다. | migration 집합이 다르거나 후보가 준비되지 않으면 기존 Blue와 Nginx를 건드리지 않는다. |
| 3 | Nginx 검증/reload 및 proxy Health 실패 fixture로 route 복구를 확인한다. | route 복구가 확인되지 않으면 두 프로세스를 보존한다. |
| 4 | 이전 연결이 남은 상태에서 drain timeout fixture를 실행한다. | 제한 시간 안에 drain되지 않으면 Blue route로 복귀하고 Green 연결이 없을 때만 Green을 종료한다. |
| 5 | 성공과 slot 교대 fixture를 실행한다. | Green `200 UP` 확인 후에만 route를 바꾸고, 이전 포트 연결이 0이 된 후 이전 서비스를 종료한다. |
| 6 | shell 구문·YAML·diff 검사를 수행하고 Dev CodeBuild 및 CodeDeploy 연결을 준비한다. | artifact에 Dev AppSpec·hook·unit이 포함되고 새 배포 그룹만 대상으로 설정된다. |

로컬 검증: fixture 17개, `bash -n`, Ruby Psych로 기존/신규 AppSpec 및 buildspec YAML parsing, `git diff --check`가 통과했다. `./gradlew test` Gradle HTML 보고서에는 1,994 tests, 0 failures, 0 skipped, 100% successful로 기록됐다. fixture는 fake systemd/Nginx/curl/ss/jar를 사용하며 실제 EC2 배포 동작을 입증하지 않는다.

## 5. 완료 기준과 다음 작업

- Dev의 첫 신규 배포 그룹 배포에서 기존 legacy `ApplicationStop`이 실행되지 않고 기존 Blue가 Green readiness 전까지 요청을 처리한다.
- Health 실패·Nginx 실패 시 이전 upstream이 유지되거나 복원되고 Blue가 active인 상태가 확인된다.
- 성공 시 진행 중 요청 drain 후 이전 프로세스가 종료되고 신규 Green만 Nginx 요청을 받는다.
- Prod의 기존 배포 흐름을 변경하지 않고 유지한다.
- 신규 Dev CodeDeploy 배포 그룹은 `Name=knot-backend-dev` 인스턴스를 대상으로 하고, 서비스 역할 `codedeploy-project`, `AllAtOnce`, 실패 자동 롤백, 필수 리소스 태그를 사용한다. Dev CodePipeline Deploy action을 새 group에 연결한 뒤에만 첫 Green revision을 배포한다.
- 실제 Dev 배포에는 승인된 revision을 `develop` pipeline으로 보내고 새 CodeDeploy 그룹 및 Deploy action을 연결하는 별도 AWS 설정이 필요하다.

별도 미검증: 운영 부하에서 자원 headroom, 자동 배포 3회 반복 요청 실패율, 실제 Green 장애 뒤 AWS automatic rollback. 동일 EC2 동시 실행에서 available memory가 234~265 MiB까지 감소한 이전 측정이 있으므로 첫 자동 배포는 요청·녹음 관측을 함께 수행한다.

로컬 완료 시점에는 AWS 배포 그룹, CodeBuild 프로젝트, CodePipeline action과 Dev EC2를 변경하지 않았다. Nginx route 복구를 확인할 수 없는 실패에서는 `/var/lib/knot-backend-deploy/blue-green/route-uncertain` marker가 남고 후속 배포를 거부한다. Dev CodeBuild 프로젝트가 inline buildspec을 쓰고 있어, AWS 연결은 `ops/codebuild/README.md`의 artifact 절차에 따라 설정한 뒤 수행해야 한다.

공식 근거: [CodeDeploy lifecycle hook 동작](https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file-structure-hooks.html), [CodeDeploy 롤백 동작](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-steps-server.html).
