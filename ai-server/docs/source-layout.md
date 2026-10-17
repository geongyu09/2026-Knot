# 코드 흐름과 책임

Java/Spring은 HTTP 접수와 현재 작업 하나를 관리합니다. TypeScript runner가 모델을 실행하고 Python supervisor가 프로세스 종료를 감독합니다. EC2의 녹음 권한 검사·S3 URL 발급·DB 저장과 네트워크 구성은 별도 책임입니다.

## Java 계층

| 계층 | 책임 |
| --- | --- |
| Presentation | `CreateTranscriptionRequest` 검증, Command 변환, HTTP 응답 |
| Application | `CreateTranscriptionCommand`, 현재 `JobSnapshot`, worker와 접수·정리 순서 |
| Domain | 전사 결과·발화의 불변식, `TranscriptionErrorCode`와 전사 예외 |
| Infrastructure | S3 다운로드, PCM 변환·검사, runner·supervisor 호출 |
| Global | 설정, Bearer 인증, `ErrorCode`·`ProjectException` 기반 공통 오류 응답 |

`create()`는 잠금 안에서 중복 ID·실행 중인 worker·준비 상태를 확인하고 새 작업을 `PROCESSING`으로 등록합니다. 별도 worker에서 `execute()`를 시작한 뒤 HTTP 응답을 반환합니다. worker는 모델 실행과 cleanup을 마친 뒤 완료 상태를 공개하고 실행 슬롯을 비웁니다. cleanup에 실패하면 새 접수를 막습니다.

`TranscriptionEngine`은 모델 실행이라는 외부 I/O 경계이자 Service 테스트의 대체 지점입니다. 구현체 `HeadlessTranscriptionEngine`은 다운로드, FFmpeg PCM 변환, 실제 길이 검사, runner 실행, 결과 검증을 연결합니다. Downloader·AudioInspector·ProcessSupervisor는 각 기술 책임을 맡습니다.

## 모델 실행과 프로세스 정리

`serverPipeline.ts`는 음량을 정규화하고 Whisper와 화자 분리를 병렬 실행한 뒤 발화를 합칩니다. 한글 바이트 복원, VAD 시간 보정, RMS 정규화와 화자별 발화 병합 로직을 포함합니다. 모델 경로와 스레드 수는 서버의 프로필 파일에서 읽습니다.

Java의 `ProcessSupervisor`가 Python `serverSupervisor.py`를 실행합니다. Python은 제한 시간과 부모 JVM 생존 여부를 감시합니다. TypeScript는 종료 신호, 한쪽 모델 실패와 출력 상한 초과 시 나머지 자식을 정리합니다. Java는 서버 시작 때 이전 작업의 소유권 기록으로 잔존 프로세스를 먼저 회수합니다. 소유권 기록은 작업 결과를 복구하는 저장소가 아닙니다.

## 최소 구현의 경계

현재 `JobSnapshot` 하나와 worker 하나만 관리합니다. 작업 목록·대기열·DB·TTL·DELETE·취소 API를 두지 않습니다. ffprobe 선검사 대신 디코딩한 PCM의 실제 형식과 길이를 검사합니다. runner는 항상 두 모델을 병렬 실행하고 제한 시간은 Python이 감독합니다.

Request와 Command는 HTTP 검증과 유스케이스 입력의 경계를 유지합니다. 오류는 팀 백엔드와 같이 `ErrorCategory`·`ErrorCode`·`ProjectException`을 사용합니다. 외부 I/O를 위한 Engine 경계, 입력·결과 검증, 프로세스 소유권 정리는 실패 복구와 동시 실행 방지에 필요해 유지합니다.

API 상태·재시도 규칙은 [HTTP 계약](http-contract.md), 실행 명령과 검증 범위는 [검증 안내](verification.md)에 있습니다. 서버·runner는 기존 Knot 프로토타입과 개인 AI 서버에서 필요한 파일을 이식했습니다. 외부 코드·도구의 출처는 [출처 기록](../THIRD_PARTY_NOTICES.md)에 있습니다.
