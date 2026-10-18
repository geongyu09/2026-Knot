# 로그인 후 AI·터널 자동 시작 검증

이 기록은 #823의 도구·격리 검증이다. 18766 운영 설치·기존 프로세스 교체·최초 로그인·화면 잠금·
로그아웃·재부팅은 실행하지 않았다. 실행 절차는 [운영 문서](../operations/mac-ai-login-startup.md)를 따른다.
로그인 전 무인 기동은 사용자 결정에 따라 완료 범위에서 제외했다.

## 대상과 결과

기준은 fresh develop `f873763ab59d969f496de046d189c25a250eaec5`다.
Java·API·DB·의존성·기존 Alloy 설치 코드는 변경하지 않았다.

```sh
python3 -W error::ResourceWarning -m unittest discover \
  -s ops/observability/mac/service -p 'test_*.py' -v
```

후속 리뷰 보완 후 42건 통과, 1.977초, ResourceWarning 오류 없음.

- 실제 private 파일·부모 권한·symlink 우회·환경 주입·고정 포트 검사.
- 실제 HTTP fixture에서 인증·redirect 차단, 임시 OS 포트 점유 검사.
- 실제 Python child에서 원문·토큰·추가 필드·초과 길이 출력 폐기, 허용된 단계 로그 보존.
- 실제 flock 경합과 SIGTERM 전달·자식 정리, 제한된 상태·로그 회전.
- 실제 plist stdin lint, 설치/원복 파일과 receipt hash·부분 실패·동시 편집 보존.
- launchctl 대역의 두 등록·기존 label 보존·동일 설치 재실행·준비 확인 실패 원복.
- 환경/JAR의 검사 후 변경과 다른 등록 경로 거절, 상태 파일 없는 반복 시작 실패 진단.
- 원격 probe의 token stdin 전달과 실제 HTTP fixture의 200·302 처리.

새 18766 label의 실제 launchctl bootstrap·SSH 접속·운영 포트는 시험하지 않았다.
EC2 단절과 원격 forward 점유는 도구의 오류 경로와 고정 옵션을 검증한 범위다.

## 독립 리뷰와 회귀

독립 리뷰에서 비문자열 UUID가 로그 필터 밖으로 AttributeError를 전파해 정상 child까지
종료시키는 결함을 재현했다. 잘못된 타입과 과도한 JSON 중첩을 폐기하도록 수정했다.
순수 함수·실제 child의 네 회귀가 RED였고 수정 후 정상 이벤트·후속 marker·종료 코드 0과
비밀값 폐기가 유지됐다. Python 3.14 C decoder는 깊은 배열을 허용하므로 중첩 오류 경계는
표준 라이브러리의 재귀 reference decoder에서도 시험했다. 수정 후 독립 리뷰는 APPROVE다.

후속 리뷰에서 TERM을 무시하고 stdout을 열어 둔 자식 때문에 wrapper가 readline에서
계속 대기하는 결함을 확인했다. 종료 신호에서 읽기를 벗어나 finally의 20초 대기·5초
강제 종료 회수를 실행하도록 수정했다. 새 fixture 전용 그룹에서 TERM 무시·열린 pipe를
재현했고 시험의 정상 종료 대기를 0.15초로 줄여 2초 안의 wrapper 종료·자식 회수를 검증했다.
별도 격리 fixture는 기본 20초를 유지한 채 20.031초에 wrapper 종료·자식 회수를 확인했다.
wrapper 관측 시각 `observedAtMs`를 단계마다 추가하고 입력 timestamp를 무시하는 회귀,
실제 AI enum 29개의 보존·임의 오류 문자열 폐기·enum 일치 회귀도 추가했다.
후속 변경도 독립 리뷰 APPROVE를 받았으며 시험 중 운영 launchctl은 호출하지 않았다.

## 2026-10-18 복구 실패 리뷰 보완

PR #825의 `05637da0`에서 잔여 `*-state.tmp`와 설치 중 부분 쓰기를 재현했다.
기존 코드에서 다섯 회귀가 실패했고 수정 후 통과했다.

- 서비스별 flock을 보유한 상태에서 이전 상태 임시파일을 제거한다. 상태 저장 실패 때도
  finally에서 임시파일을 정리해 이전 정상 상태 파일을 보존한다. 잔여 파일이 있어도
  실제 자식 두 번의 종료 코드 7, 실패 횟수 2, 종료 로그 두 건이 기록된다.
- 백업 receipt, 활성 receipt와 설치 파일은 같은 디렉터리의 비공개 임시파일에 완성한 뒤
  hard link로 게시한다. 최종 경로가 먼저 생기면 덮어쓰지 않고 실패한다.
- 활성 receipt를 게시한 뒤의 실패만 기존 원복 검사를 호출한다. 각 쓰기 단계에 8바이트
  기록 뒤 OSError를 주입해 불완전한 최종 파일이 남지 않고 다음 설치가 성공함을 확인했다.
  게시 경합으로 생긴 receipt와 사용자의 파일 변경은 보존한다. 설치 파일의 후속 변경은
  기존 `RECOVERY_CONFLICT`로 원복을 중단한다.

같은 명령으로 서비스 시험 50건(기존 42건과 신규 8건)이 2.812초에 통과했다.
기존 host 시험 11건과 AI metrics 설정 시험 6건도 통과했고, Python compile과
`git diff --check`에 오류가 없었다. launchctl은 대역만 사용했으며 운영 SSH·설치·재시작은
실행하지 않았다. 이번 Python 수정에 Gradle 전체 검증을 다시 실행하지 않았다.

원문 hash gate는 통과했다. 변경 범위 감사는 이번 diff 밖 `build.gradle`의 기존
`LIB-VERSION` 3건 때문에 실패했다. Python 파일은 해당 검사기의 Java 검사 대상이 아니므로
이 결과를 Python 동작 검증으로 해석하지 않는다.

PR #819와의 통합 시험에서 추가된 `INVALID_WINDOW`, `ATTEMPT_CONFLICT`가
`UNKNOWN_FAILURE`로 바뀌는 호환 결함도 확인했다. 두 코드를 허용 목록에 명시적으로 추가했다.
허용 집합은 현재 AI enum과 이 두 호환 코드의 합집합과 정확히 같아야 한다. 실제 enum의
모든 코드 보존과 임의 문자열의 `UNKNOWN_FAILURE` 치환 검증도 유지했다.
두 새 코드의 직접 보존 회귀와 집합 비교가 수정 전 실패했고 수정 후 통과했다.

기존 AI enum 29개를 사용하는 독립 소스에서 서비스 51건이 3.498초에 통과했다.
통합 소스의 실제 AI enum 31개를 파일 읽기 대역으로 공급한 독립 소스 전체 시험도
동일한 51건이 3.549초에 통과했다. 통합사본의 제품 파일은 이 시험에서 수정하지 않았다.
Python compile과 `git diff --check`도 다시 통과했다.

## 기존 코드 회귀

- Governance 10건, 기존 AI metrics 설정 계약 6건 통과.
- 기존 host 시험의 고정 12346 bind와 실패 정리의 미격리 launchctl 호출을 수정했다.
  초기 원본 11건 중 2건은 운영 포트 충돌로 오류가 났다. 포트만 격리한 재실행에서는
  실패 정리 코드가 실제 Alloy label을 해제했다. 기존 config·plist 해시를 확인하고 같은
  기존 label을 bootstrap해 복구했다. 기존 AI·터널 PID는 유지했다.
  영향이 발생한 시험은 2026-10-18 17:24:57 KST에 끝났고 실행 시간은 16.506초였다.
  따라서 label 해제는 약 17:24:41~17:24:57 사이이며 정확한 시각은 관측하지 못했다.
  복구 wrapper의 시작 시각은 17:28:01이다. 17:30:27 검증에서 ready 200,
  마지막 전송 표본 약 7.1초 전·pending 0·failed 0, config·plist hash 보존을 확인했다.
  이후 host 시험의 모든 launchctl 호출을 대역으로 막고 bind를 OS 임시 포트로 바꿨다.
  실패 정리 명령이 실제 subprocess에 도달하지 않는 회귀를 추가해 원본 suite 11건을 통과했다.
  이 수집기 복구와 새 18766 서비스의 설치를 구분한다. 수집 공백의 무손실을 주장하지 않는다.
- `./gradlew spotlessCheck test integrationTest acceptanceTest bootJar --no-daemon --no-parallel --max-workers=2`
  성공, 4분 46초. 단위 1,735·PostgreSQL 통합 777·인수 586건, 총 3,098건 실패·오류 0.
  통합의 실제 S3 opt-in 1건은 생략됐다. 이 결과는 Mac 실제 기동의 증거가 아니다.

## 감사와 남은 확인

팀 컨벤션 00~08 원문 hash gate는 통과했다. 이번에는 Python 운영 도구·문서만 추가했다.
변경 범위 감사는 기존 build.gradle LIB-VERSION 3건, 전체 감사는 기존 Java·테스트·빌드
진단 1,293건으로 실패했다. `verify_backend.py`와 `--full`은 이 감사에서 중단됐으며,
위 Gradle 명령은 별도로 직접 통과했다. 검사기는 새 Python의 의미·운영 안전을 증명하지 않아
실제 경계 시험과 독립 리뷰를 별도 수행했다. 전체 컨벤션 감사 성공으로 표시하지 않는다.

후속 운영 적용에서 로컬/터널 인증, host/service 중앙 새 표본, 실제 업무의 결과·persist,
수집기와 각 전용 서비스의 재시작, 최초 로그인 기동·화면 잠금 중 지속 실행을 확인해야 한다.
사용자가 승인한 범위를 넘어 FileVault·SSH 권한·18765·개발 프로세스를 변경하지 않는다.
