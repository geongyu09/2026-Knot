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

39건 통과, 2.139초, ResourceWarning 오류 없음.

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
