# 개발 CodeBuild 실행 구조

`build-stage.yml`은 `knot-backend-dev-pipeline`의 기존 Build 단계를 설명하는
CodePipeline 구성 조각임. 전체 파이프라인이나 IAM 역할을 생성하는 템플릿은 아님.

## 병렬 실행과 배포 조건

- `IntegrationTest`: `CI_GROUP=integration`, 전체 통합 테스트, `IntegrationReports` 출력임.
- 기존 `Build`: `CI_GROUP=remaining`, Spotless → 단위 → 인수 → bootJar와 패키징,
  기존 `BuildArtifact` 출력임.
- 두 작업의 `runOrder`는 1이며 같은 `SourceArtifact`를 사용함.
- Deploy는 다음 단계에서 기존 `BuildArtifact`를 입력으로 사용함.
  현재 Build 단계의 두 작업이 모두 성공해야 다음 단계로 넘어감.
- 두 작업은 기존 프로젝트 `knot-backend-dev-build`와 그 역할 `codebuild-project`를
  사용함. 배치 빌드와 별도 배치 역할은 사용하지 않음.

루트 `buildspec.yml`의 기본 `CI_GROUP=all`은 단독 빌드에서 전체 검증을 수행함.
등록하지 않은 그룹은 실패 처리함. 실제 테스트는 매 실행 수행하며 컴파일 준비와
Spotless, bootJar에는 Gradle build cache를 허용함.

명령 블록은 `set -euo pipefail`로 검증 실패 뒤 패키징을 중단함. 이전 phase 실패는
`CODEBUILD_BUILD_SUCCEEDING`으로 차단함. `on-failure: ABORT`는 리포트 업로드도
생략하는 동작을 AWS canary에서 확인해 사용하지 않음. 기본 실패 전이로 빌드는 실패 상태를
유지하고 `UPLOAD_ARTIFACTS`에서 이미 생성된 XML과 HTML을 수집함.

## 실제 AWS 설정

대상은 ap-northeast-2의 개발 프로젝트와 개발 pipeline임. 운영 프로젝트에 자동 적용하지 않음.
프로젝트가 inline buildspec을 사용하므로 저장소 파일 변경만으로 AWS 명령이 갱신되지 않음.
Blue-Green 이행 전까지는 AWS inline buildspec이 적용본이며, 저장소 `buildspec.yml` 수정만으로
해당 설정이 바뀌지 않음. Blue-Green 전환 시 적용 방법은 아래 artifact 절차를 따름.

S3 캐시는 `techcourse-project-2026-artifacts/knot/codebuild-cache/dev`를 사용함.
키는 그룹, Gradle 설정 해시와 소스 파일 해시로 구분하고 같은 설정의 이전 키를
fallback으로 조회함. 소스 해시는 현재 파일 확장자가 있는 소스와 리소스를 대상으로 함.
확장자 없는 빌드 입력을 추가하면 해시 패턴도 함께 검토해야 함.

캐시에는 Gradle wrapper와 caches만 포함함. 테스트 결과, DB 데이터, 배포 파일과
Gradle 인증 설정을 넣지 않음. 동일 키의 S3 캐시는 불변이므로 소스 해시를 포함함.

배포 artifact의 루트에는 `app.jar`, `appspec.yml`, `scripts/`를 유지함.
XML과 HTML도 artifact 수집 대상으로 두며 실패 실행에서는 CloudWatch 로그와
실제로 업로드된 리포트를 각각 확인해야 함. 설정에 경로가 있다는 사실만으로
실패 리포트 업로드 성공을 판정하지 않음.

## Dev Blue-Green artifact

Blue-Green Dev artifact는 루트 `buildspec.yml`의 `DEPLOYMENT_MODE=dev-bluegreen`으로
생성한다. 이 모드는 `appspec-dev-bluegreen.yml`을 artifact 루트의 `appspec.yml`로
패키징하고 두 slot의 systemd unit을 `scripts/systemd/`에 포함한다. 기본값은
`legacy-in-place`이므로 기존 artifact 모양과 Prod 배포 동작은 유지한다.

현재 Dev CodeBuild 프로젝트는 inline buildspec을 사용하므로 저장소 buildspec을 바꿔도
빌드에는 적용되지 않는다. Blue-Green 배포를 연결할 때 Build 프로젝트가 저장소의
`buildspec.yml`을 사용하도록 설정하고, 프로젝트 환경 변수 `DEPLOYMENT_MODE`를
`dev-bluegreen`으로 지정한다. Pipeline의 기존 `CI_GROUP=remaining` override와 별도
IntegrationTest action은 유지한다. Deploy action은 기존
`knot-backend-dev-deployment-group`을 계속 대상으로 사용한다.

기존 그룹의 첫 Blue-Green revision에서는 직전 revision의 `ApplicationStop`이 legacy
서비스를 정지할 수 있다. 이 일시 중단은 승인된 이행 절차다. 새 AppSpec의
`BeforeInstall` hook은 CodeDeploy가 이전 JAR를 정리하기 전에 `/opt/knot-backend/app.jar`를
Blue slot으로 보존한다. `ApplicationStart` hook은 legacy 서비스가 멈춰 있고 Nginx가
8080을 가리키는 최초 이행 상황이면 보존한 JAR로 Blue를 다시 준비한 뒤 Green을 기동한다.
후속 배포에서는 현재 활성 slot을 유지하며 비활성 slot만 교체한다.

실제 AWS 설정은 아직 Blue-Green artifact로 전환하지 않았다. 최근 파이프라인 배포는 기존
inline buildspec과 in-place AppSpec을 사용했으며 CodeDeploy 그룹의 automatic rollback도
비활성 상태였다. AWS 변경 후에는 기존 그룹 이름·인스턴스 태그·롤백 설정과 CodePipeline
Deploy action의 대상을 확인한다. 첫 배포 전에 artifact 루트 AppSpec이
`appspec-dev-bluegreen.yml`에서 복사됐는지, `scripts/dev_bluegreen_preserve_legacy.sh`,
`scripts/dev_bluegreen_deploy.sh`, `scripts/systemd/`가 모두 포함됐는지 확인한다.

Hook이 `/var/lib/knot-backend-deploy/blue-green/route-uncertain`을 남기면 다음 배포는
자동으로 거부된다. Nginx의 디스크 설정과 실행 중인 upstream을 확인하고 이전 서버의
health가 정상인 상태에서 route를 복구한 뒤, marker를 지우고 재시도한다. marker가 있는
동안에는 두 프로세스가 남을 수 있으므로 자원 사용량도 확인한다.

## 검증 기록

로컬 shell fixture와 실제 Gradle 실행, AWS 실행은 구분해 기록함.
캐시가 없는 첫 실행과 cache hit 실행의 시간, 빌드 ID, 소스 ZIP 해시와 적용한
buildspec 해시를 남김. 서로 다른 소스나 키의 실행으로 전후 개선율을 계산하지 않음.
5분 이내 완료는 목표이며 실제 측정 없이 보장하지 않음.

- [동일 runOrder의 병렬 실행](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-requirements.html)
- [CodePipeline 단계 실행 규칙](https://docs.aws.amazon.com/codepipeline/latest/userguide/concepts-how-it-works.html)
- [S3 캐시와 동적 키](https://docs.aws.amazon.com/codebuild/latest/userguide/caching-s3.html)
- [CodeBuild action 설정](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeBuild.html)
