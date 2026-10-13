# Knot AI 서버

EC2 백엔드와 별도로 빌드하고 맥미니에서 실행하는 AI 서버입니다.
현재 단계에는 프로젝트 기반과 전사 결과 모델만 포함합니다. 전사 실행과 HTTP API는 후속 작업입니다.

Java 25, Spring Boot 4.1.0과 팀 백엔드의 Gradle Wrapper·Spotless 설정을 사용합니다.
runner에는 Node.js 22 이상과 pnpm 10.33.0이 필요합니다.

## 검증과 실행

저장소 루트에서 실행합니다.

```sh
cd ai-server
pnpm --dir runner install --frozen-lockfile
pnpm --dir runner typecheck
./gradlew check bootJar
java -jar build/libs/knot-ai-server-0.0.1-SNAPSHOT.jar
```

기본 주소는 `127.0.0.1:18765`입니다. 실행 포트는 `AI_PORT` 환경 변수로 변경합니다.
현재는 HTTP 요청을 처리하는 Controller가 없으므로 요청에 404를 반환합니다.
서버 기동은 모델 실행 준비 완료를 의미하지 않습니다.

모델·녹음·비밀값·실행 결과·개인 설정은 Git에 포함하지 않습니다.
현재 단계의 테스트는 실제 모델이나 AWS에 접근하지 않습니다.
