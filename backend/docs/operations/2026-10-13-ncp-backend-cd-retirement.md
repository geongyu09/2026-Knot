# NCP Backend Dev CD 종료

- 관련 Issue: [#644](https://github.com/woowacourse-teams/2026-Knot/issues/644)
- 담당자: 흑곰 (`jyt6640`)
- 종료 범위: NCP 개발 서버의 **백엔드 애플리케이션 배포**
- 유지 범위: Backend CI, AWS 배포, NCP Grafana 및 Loki/Alloy 로그 수집

## 문제 상황

AWS 배포로 전환했지만 `.github/workflows/deploy-backend-dev.yml`의
`develop` push 트리거가 남아 있었다. GitHub의 `Backend Dev CD` workflow도
활성 상태여서 사용하지 않는 NCP 앱 서버 배포가 실행됐다.

[실패 실행 38379571193](https://github.com/woowacourse-teams/2026-Knot/actions/runs/38379571193)은
2026-10-13 18:53:41 KST에 시작해 19:07:25 KST에 종료됐다.
Backend CI 게이트, 빌드, NCP JAR 업로드는 성공했으나 배포 전 기존 서비스 복구가
`preflight-recovery-failed`로 실패했다. 이후 Discord에 NCP 복구 실패 알림이 전달됐다.
이 실행 결과는 AWS 배포 실패를 의미하지 않는다.

## 조치

1. 2026-10-13 19:18 KST에 GitHub workflow `343569384`를 비활성화했다.
2. NCP CD workflow 파일을 제거해 `develop` 자동 트리거, SSH/JAR 전송,
   서비스 재시작, 롤백, NCP 배포 결과 알림 경로를 함께 제거했다.
3. Governance 테스트에 NCP CD 파일 및 `NCP_DEV_` 자격 증명 참조가
   다시 추가되지 않는지 확인하는 회귀 검사를 추가했다.

GitHub 비활성화는 즉시 적용되지만 기본 브랜치의 파일 제거는 PR merge 후 적용된다.
PR은 자동으로 merge하지 않는다. 제거된 배포 파일은 Git 이력에서 복구할 수 있다.
GitHub 시크릿, NCP 서버와 기존 서버 파일은 삭제하지 않았다.

## 유지되는 경로

| 대상 | 유지되는 자산 |
| --- | --- |
| Backend CI 및 CI 실패 알림 | `.github/workflows/backend-ci.yml` |
| AWS 빌드 및 배포 | `buildspec.yml`, `backend/appspec.yml`, `backend/scripts/` |
| Grafana, 메트릭, 로그 수집 및 관측 알림 | `backend/ops/observability/` |

NCP 앱 배포 종료는 NCP 관측 서버 종료가 아니다. Grafana 장애 알림과 CI 알림은
기존 설정을 유지한다. AWS 배포 설정이나 서버 서비스를 변경하지 않았다.

## 검증 결과

- GitHub API에서 `Backend Dev CD`의 `state=disabled_manually` 확인.
- 변경 직전 최근 NCP 실행 5건은 모두 `completed`; 진행 중인 실행은 없었다.
- 제거 전 회귀 검사 2개 실패로 잔존 workflow를 검출했고, 제거 후 통과했다.
- `python3 -m unittest discover .github/scripts -p 'test_*.py' -v`로 전체 Governance 검사 수행.
- 기준 커밋 대비 CI/AWS/observability 자산의 diff가 없는지 확인했다.

이 검증은 GitHub 설정과 저장소 변경 범위에 대한 확인이다. 이번 조치에서 NCP/AWS
호스트의 서비스를 재시작하거나 운영 로그 수집을 새로 실측하지 않았다.

## 재도입 시 주의

NCP 앱 배포를 다시 도입하려면 종료 이유와 AWS 배포와의 역할 분리를 먼저 재검토한다.
단순히 GitHub workflow를 활성화하지 않는다. Git 이력에서 복원한 구성, 대상 서버,
헬스체크 및 시크릿의 유효성을 별도 작업으로 검증한다.
