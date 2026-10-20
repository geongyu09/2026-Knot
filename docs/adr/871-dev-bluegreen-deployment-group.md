# Dev 단일 EC2 Blue-Green 전환은 기존 CodeDeploy 그룹과 분리된 전용 배포 그룹에서 수행하며 Green 준비와 Nginx 검증 전까지 기존 Blue를 유지한다.

## 상태

Proposed

## 관련 Issue

- #871 [BE] Dev 단일 EC2 Blue-Green 배포 자동화

## 한 줄 요약

Dev 단일 EC2 Blue-Green 전환은 기존 CodeDeploy 그룹과 분리된 전용 배포 그룹에서 수행하며 Green 준비와 Nginx 검증 전까지 기존 Blue를 유지한다.

## 왜 이 결정이 필요했나

Dev의 현재 CodeDeploy in-place revision은 단일 app.jar를 덮어쓰고 이전 revision의 ApplicationStop으로 기존 서비스를 정지한다.

Dev 배포 도중 진행 중인 녹음 연결이 Blue 종료와 함께 끊길 수 있고 기존 세션을 복구할 수 없다.

결정 동인:

- 기존 Blue가 Green readiness 전까지 요청을 계속 처리함
- Nginx 전환 실패 시 기존 경로 복구
- Prod 및 legacy Dev 경로 격리
- 단일 t4g.small에서 두 JVM의 자원 부담 관측

## 트레이드 오프

- 기존 knot-backend-dev-deployment-group을 수정해 Blue-Green hook으로 전환
- 기존 그룹을 유지하고 새 knot-backend-dev-bluegreen deployment group을 만들어 단계적으로 전환

## 무엇을 결정했나

Dev 단일 EC2 Blue-Green 전환은 기존 CodeDeploy 그룹과 분리된 전용 배포 그룹에서 수행하며 Green 준비와 Nginx 검증 전까지 기존 Blue를 유지한다.

기존 그룹의 ApplicationStop이 새 revision을 받기 전에 실행될 수 있어 첫 Blue-Green 배포에서 Blue를 조기 중지할 위험이 있다. 새 그룹을 사용하면 기존 배포 경로를 보호한 채 신규 흐름을 검증할 수 있다.

## 결과

- Dev 파이프라인은 신규 deployment group에 artifact를 배포하도록 연결해야 한다.
- 기존 Dev 그룹과 Prod 배포는 기존 동작으로 남으며, 두 Dev 배포 경로의 상태를 명시적으로 관리해야 한다.
- 첫 신규 그룹 배포에는 자동 재배포할 성공 revision이 없으므로 수동 복구를 검증해야 한다.

## 다시 논의해야 할 조건

- Dev 배포를 다중 EC2/Load Balancer 방식으로 전환할 때
- 기존 legacy Dev 그룹을 안전하게 폐기할 계획을 세울 때
- Blue-Green 슬롯 또는 라우팅 구조를 변경할 때

## 확인

- 예정 경로: `docs/adr/871-dev-bluegreen-deployment-group.md`
- 결정 주체: Knot 팀
- AI 하네스가 Proposed ADR 파일을 생성했다.
- 팀이 PR에서 승인한 뒤 Accepted로 바꾼다.
