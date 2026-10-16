# 검증 안내

## 2026-10-16 앞 2시간 전사 — Issue #723

자동 종료 응답 지연으로 파일이 2시간을 넘더라도 전사할 수 있도록, FFmpeg 출력에 `-t 7200`을 적용했습니다. PCM 검증과 출력 바이트 제한은 유지합니다.

- `./gradlew spotlessApply check bootJar`: Java 102개 통과, 실제 모델 opt-in 1개 생략
- `pnpm --dir runner typecheck`, `pnpm --dir runner test`: 타입 검사와 Node 12개·Python 5개 통과
- Governance 검증기 테스트 10개와 `git diff --check`: 통과
- `HeadlessTranscriptionEngineTest`: 5개 입력 길이에 대해 제한된 WAV가 runner에 전달되는지, 다운로드한 원본이 유지되는지 확인합니다. 변환기가 상한을 무시한 PCM은 기존처럼 거절합니다. 이 테스트의 변환기·runner는 stub입니다.

로컬 FFmpeg 8.1로 실제 변환도 별도 확인했습니다. 16kHz mono PCM16 입력의 샘플 수별 결과는 다음과 같습니다. 115,200,000샘플이 7,200초입니다.

| 입력 샘플 수 | 출력 샘플 수 |
| ---: | ---: |
| 16,000 | 16,000 |
| 115,199,999 | 115,199,999 |
| 115,200,000 | 115,200,000 |
| 115,200,001 | 115,200,000 |
| 115,216,000 | 115,200,000 |

모든 출력 PCM이 입력의 앞부분과 바이트 단위로 같고, 입력 SHA-256이 유지됐습니다. 7,201초 합성 Opus WebM에서도 제한 결과가 전체 디코딩 결과의 앞 7,200초와 일치했습니다. `-t`를 빼면 7,201초가 출력돼 기존 상한 검증에 걸리는 것도 확인했습니다.

```sh
ffmpeg -f lavfi -i 'sine=frequency=997:sample_rate=16000:duration=7201' -c:a libopus -b:a 16k source.webm
ffmpeg -i source.webm -vn -ac 1 -ar 16000 -c:a pcm_s16le -t 7200 -fs 231448576 output.wav
```

공통 컨벤션 감사는 변경 파일·전체 범위 모두 DB 없는 모듈에 적용되지 않는 기존 진단 4개(JPA·Flyway·PostgreSQL·DB Testcontainers)만 반환했습니다. 원문 hash 검사는 통과했으며 새 Java 작성 규칙 진단은 없습니다. 실제 모델의 2시간 전사, S3·EC2·문서 생성 전체 흐름과 배포는 이번 검증에 포함하지 않습니다.

## 2026-10-13 로컬 검증

- `./gradlew spotlessApply check bootJar`: 성공. Java 97개 통과, opt-in 실제 모델 테스트 1개 생략
- `pnpm --dir runner install --offline --frozen-lockfile`: 성공
- `pnpm --dir runner typecheck`: 성공
- `pnpm --dir runner test`: Node 12개·Python 5개 통과
- Governance 검증기 테스트 8개와 `git diff --check`: 성공
- 독립 코드 리뷰: 수정이 필요한 확정 결함 없음

Knot 컨벤션 00~08 원문 hash 검사와 AI 모듈 전체 Java 작성 규칙 검사를 확인했습니다. 공통 감사기는 DB 없는 AI 모듈에도 JPA·Flyway·PostgreSQL·DB Testcontainers를 요구해 적용되지 않는 진단 4개를 반환합니다. 자동 감사 전체 통과와 구분합니다.

| 규칙군 | 적용 |
| --- | --- |
| STACK·LIB | 팀 Java 25·Boot 4.1·Gradle 유지, 기존 Spring Validation과 runner 실행 도구 사용 |
| LAYER·MODEL | Request→Command, 단일 작업 조정, 결과 불변식, 외부 실행 Port 유지 |
| API | Bearer 인증, 202·Location, 현재 작업 조회, 한글 오류·검증, 민감값 비노출 |
| DB | 해당 없음. 메모리의 현재 작업만 관리 |
| JAVA·TEST | 팀 formatter·작성 규칙과 정상·실패·동시성·프로세스 회귀 검증 |
| AI·DELIVERY | 실제 코드 검토와 실행 증거 확인, #632·#634·#635·#636을 한 PR에 포함 |

## 기본 검증 범위

`ai-server/`에서 다음 검사를 실행합니다. 실행 결과는 해당 PR의 검증 기록을 기준으로 합니다.

```sh
pnpm --dir runner install --frozen-lockfile
pnpm --dir runner typecheck
pnpm --dir runner test
./gradlew check bootJar
```

| 검사 | 확인하는 범위 |
| --- | --- |
| Java 테스트 | 결과 불변식, 중복·동시 접수, cleanup 전 슬롯 유지, 결과 교체, 종료·정리 실패 후 접수 차단 |
| MVC 테스트 | Bearer 인증, 요청 검증, 202·Location, 조회·health·오류 응답 |
| Infrastructure 테스트 | S3 URL·리다이렉트·다운로드 제한, 실제 PCM 형식·길이, fake engine·runner 호출 |
| Node 테스트 | 한글 복원, 모델 기본 인자, RMS 정규화, 발화 병합과 자식 프로세스 종료 |
| Python·JVM 종료 테스트 | 실행 제한 시간, 부모 JVM 강제 종료와 재시작 후 소유 프로세스 회수 |
| Spotless·컴파일·JAR 빌드 | Java 포맷과 독립 모듈 빌드 |

기본 검사에는 실제 모델·S3·EC2 연결이 포함되지 않습니다. 다운로드 제한 시간 검사는 stub 기반이므로 실제 네트워크가 멈춘 환경의 정확한 종료 시간을 입증하지 않습니다. DB를 사용하지 않으므로 AI 모듈의 검사에 JPA·Flyway·DB Testcontainers는 포함하지 않습니다.

`RealPipelineHttpTest`는 `AI_REAL_PIPELINE=true`와 모델·녹음 경로를 제공할 때만 실행됩니다. 이 테스트도 S3는 stub으로 대체합니다. 실행 명령은 [README](../README.md#실제-모델-http-테스트)에 있습니다. 실제 S3·EC2 연결과 전사 품질·운영 배포는 별도로 확인해야 합니다.

## 2026-10-13 실제 모델 검사

설치된 Whisper·sherpa 모델과 10.7초 한국어 합성 음성으로 `RealPipelineHttpTest`가 통과했습니다. HTTP 접수·폴링, FFmpeg 변환, runner의 전사·화자 분리, 한국어 발화 결과 반환까지 확인했습니다. S3 전송은 stub으로 대체했으며, 테스트 음성과 로컬 모델 경로는 커밋에 포함하지 않습니다.

이 결과는 실제 S3·EC2 연결이나 회의 녹음의 전사 품질을 입증하지 않습니다.
