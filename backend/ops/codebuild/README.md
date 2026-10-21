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
Dev CodeBuild 프로젝트가 inline buildspec을 사용하는 경우 저장소 파일 변경만으로 AWS 명령이
갱신되지 않음.
CodeDeploy `d-LDPC9VU69`에서 Dev Blue-Green hook이 실행되어 Green 준비와 Nginx 전환까지
진행된 것을 확인했다. 해당 배포는 기존 Blue의 8080 연결이 drain 제한 시간 안에 사라지지
않아 롤백됐다. 이 관측은 배포 artifact에 Green hook이 포함됐다는 근거이며, 저장소
`buildspec.yml`이 실제 Build 입력이었다는 근거는 아니다. 아래 패키징 절차와 실제 inline
buildspec/artifact 구성을 수정 revision 검증 때 대조한다.

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

저장소의 Blue-Green Dev artifact는 루트 `buildspec.yml`에서
`DEPLOYMENT_MODE=dev-bluegreen`으로 생성한다. 이 모드는
`appspec-dev-bluegreen.yml`을 artifact 루트의 `appspec.yml`로
패키징하고 두 slot의 systemd unit과 loopback 전용 Nginx metrics 설정을 각각
`scripts/systemd/`, `scripts/nginx/`에 포함한다. 기본값은 `legacy-in-place`이므로 기존
artifact 모양과 Prod 배포 동작은 유지한다.

마지막 설정 관측에서는 Dev CodeBuild 프로젝트가 inline buildspec을 사용했다. CodeDeploy
`d-LDPC9VU69`에서 Green hook이 실행된 것은 확인했지만, 저장소 `buildspec.yml`이 실제 Build
입력이었다는 뜻은 아니다. 수정 revision을 배포하기 전 Build 프로젝트의 inline buildspec과
실제 artifact 내용을 대조하고, AppSpec·hook·unit·metrics 설정이 모두 포함됐는지 확인한다.
Pipeline의 기존 `CI_GROUP=remaining` override와 별도 IntegrationTest action은 유지하며,
Deploy action은 기존 `knot-backend-dev-deployment-group`을 대상으로 한다.

기존 그룹의 첫 Blue-Green revision에서는 직전 revision의 `ApplicationStop`이 legacy
서비스를 정지할 수 있다. 이 일시 중단은 승인된 이행 절차다. 새 AppSpec의
`BeforeInstall` hook은 CodeDeploy가 이전 JAR를 정리하기 전에 `/opt/knot-backend/app.jar`를
Blue slot으로 보존한다. `ApplicationStart` hook은 legacy 서비스가 멈춰 있고 Nginx가
8080을 가리키는 최초 이행 상황이면 보존한 JAR로 Blue를 다시 준비한 뒤 Green을 기동한다.
후속 배포에서는 현재 활성 slot을 유지하며 비활성 slot만 교체한다.

Blue-Green hook은 Alloy의 Spring scrape를 `127.0.0.1:18080`의 loopback Nginx endpoint로
보낸다. 배포 때 이 endpoint도 활성 application slot으로 전환하므로 모니터링의 유휴 TCP
연결이 이전 slot의 drain을 막지 않고, Blue 종료 뒤에도 Spring metrics 수집이 이어진다.
Alloy 설정 파일은 실행 중 컨테이너의 bind mount inode를 유지한 채 갱신하고 `/-/reload`로
반영한다.

마지막 확인에서 CodeDeploy 그룹의 automatic rollback은 비활성 상태였다. 수정 revision 배포
전에 기존 그룹 이름·인스턴스 태그·롤백 설정과 CodePipeline Deploy action의 대상을 확인한다.
배포 artifact 루트 AppSpec이 `appspec-dev-bluegreen.yml`에서 복사됐는지,
`scripts/dev_bluegreen_preserve_legacy.sh`, `scripts/dev_bluegreen_deploy.sh`,
`scripts/systemd/`, `scripts/nginx/`가 모두 포함됐는지 확인한다.

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
