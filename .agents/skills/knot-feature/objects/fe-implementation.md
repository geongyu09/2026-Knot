<!-- 만든 사람: 유월 / 모델: Claude Fable 5.1 (Claude Code) / 2026-10-22 -->

# FE 구현 하네스 (객체)

한 문장 책임: 이슈와 Figma를 직접 읽어 프론트를 구현하고, 단위 테스트, 통합 테스트, 스토리북을
만든 뒤 QA 시트를 읽어 E2E까지 만들고 PR을 올린다.

| 읽기 | 쓰기 |
| --- | --- |
| 이슈, Figma, QA 시트, API 명세 | `frontend` 코드, PR |

## 받는 메시지

| 보내는 쪽 | 메시지 | 조건 |
| --- | --- | --- |
| 입구 스킬 | 이슈 URL 전달, 「구현해라」 | 완료 조건이 「개발까지」일 때만 |

## 보내는 메시지

| 받는 쪽 | 메시지 | 조건 |
| --- | --- | --- |
| 입구 스킬 | PR URL | 구현과 PR이 끝났을 때 |

## 규칙

- 자율적인 객체가 아니다. 다른 객체에게 메시지를 보내 정보를 받지 않고 GitHub 이슈, Figma, 노션
  QA 시트에 직접 접근해 스스로 처리한다. 도메인 규칙은 읽지 않는다.
- 이슈 본문의 「노션 변경 사항」 링크가 정본 위치다. 이슈와 Figma가 있으면 다 구현할 수 있다.
- 기존 프론트 하네스를 그대로 쓴다. `frontend/CLAUDE.md`의 작업 절차와 `frontend/.claude/rules`,
  `project-structure`, `create-story`, `create-pr-content`, `review` 스킬. 브랜치는
  `fe/<type>/#<이슈 번호>`이고 워크트리에서 작업한다.
- 테스트는 반드시 있다. 단위 테스트는 함수 단위로, 통합 테스트는 구현에 필요한 것을 알아서 만들고
  돌린다. 위치와 대상은 `frontend/.claude/rules/test-strategy.md`를 따른다. TDD 적용 여부와 세부
  방식은 이 하네스 안에서 정하고 강제하지 않는다.
- 스토리북을 만들고 스토리의 `parameters.design`에 Figma URL을 넣는다(`create-story`).
- 구현을 마친 뒤 `objects/qa-e2e.md`의 절차를 그대로 수행해 QA 시트의 관련 행을 E2E 테스트로
  옮긴다. 그래야 CI 게이트가 돕는다.
- 테스트는 가능한 한 버튼 문구가 아니라 역할이나 테스트 ID로 잡는다.
- 이 흐름에서는 사용자에게 물을 수 없다. 기존 스킬의 확인 단계(`create-story`의 스토리 목록 확인,
  `create-pr-content`의 안내 문구 받기와 PR 열기 확인)는 묻지 않고 진행하고, 그 결과(스토리 목록,
  안내 문구)를 PR 본문에 적는다. 완료 조건 「개발까지」가 commit, push, PR 생성의 명시 요청이다.
- 커밋은 프론트 컨벤션(`feat`, `fix`, `docs`, `refactor`, `chore`)과 이슈 번호 트레일러를 쓰고
  co-author와 AI 생성 표시를 붙이지 않는다.
- PR은 루트 `AGENTS.md` 「기능 구현 요청 파이프라인」의 PR 공통 규칙을 따른다. 첫 섹션
  `## 노션 변경 사항`에 이슈의 링크를 끌어와 적고, `관련 이슈`에 `Closes #<번호>`, `작업 내용`에
  스토리북과 E2E 통과 결과, E2E 시나리오 설명을 넣는다. 이슈 라벨을 그대로 붙이고 assignee를
  지정한다. 유월이 이 PR을 컨펌한다.
- ADR이 필요한 이슈(`메모`에 ADR 결정과 예정 경로)는 구현 브랜치에서
  `python3 harness/materialize_adr.py <snapshot.json> --issue-number <번호> --implementation --pretty`
  로 `Proposed` ADR을 만들어 같은 PR에 넣는다.
- 실패 루프: 테스트 실패 수정은 3회까지 시도하고, 그래도 실패하면 `blocked`로 멈추고 원인과 시도
  내역을 `question`에 적는다. 구현 중 요구사항이나 명세 문제를 발견하면 문서 단계로 되돌리지 않고
  `needs_user_input`으로 멈춰 입구에 알린다.
- `frontend` 밖의 코드는 고치지 않는다. 백엔드 변경이 필요하면 `needs_user_input`으로 알린다.

## 반환

`references/return-contract.md`의 규약 그대로. `changed`의 `kind`는 `pr`, `url`은 PR 링크,
`summary`는 브랜치와 포함된 것(구현, 테스트, 스토리, E2E, ADR). `next`는 비워 둔다.

## 하지 않는 것

- 노션 문서와 Figma를 고치지 않는다. merge 하지 않는다.
- 다른 객체를 부르지 않고 사용자에게 직접 묻지 않는다.
