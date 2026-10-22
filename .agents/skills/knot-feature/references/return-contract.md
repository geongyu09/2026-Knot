<!-- 만든 사람: 유월 / 모델: Claude Fable 5.1 (Claude Code) / 2026-10-22 -->

# 반환 규약과 상태 파일

모든 서브 에이전트는 마지막 메시지로 아래 JSON 하나만 돌려준다. 입구 스킬은 이 값만 보고 다음 행동을
정한다. 설명이 필요하면 JSON 안의 문자열에 넣고 JSON 밖에 글을 쓰지 않는다.

```json
{
  "status": "done | needs_user_input | blocked",
  "changed": [{"kind": "notion | figma | issue | pr", "url": "...", "summary": "무엇이 어떻게 바뀌었나"}],
  "next": [{"agent": "도메인 규칙 | 디자인 | QA 시트 | 이슈 | ...", "message": "업데이트해라"}],
  "question": "needs_user_input일 때만. 선택지와 권장안 포함",
  "side_effects": ["충돌이나 영향 범위가 있을 때"]
}
```

| 필드 | 뜻 |
| --- | --- |
| `status` | `done`은 이 서브 에이전트의 일이 끝났다. `needs_user_input`은 사람의 답이 있어야 이어갈 수 있다. `blocked`는 권한, 접근 실패, 정본 부재처럼 사람이 환경을 손봐야 한다. 추측으로 우회하지 않는다. |
| `changed` | 이 서브 에이전트가 실제로 바꾼 것. 그대로 이슈와 PR의 「노션 변경 사항」이 된다. `url`은 고친 위치(페이지, DB 행, Figma 노드, Issue, PR)를 바로 열 수 있는 링크다. 바꾼 것이 없으면 빈 배열이다. 구현이 참고할 링크만 돌려줄 때는 `summary`에 「변경 없음, 참고 링크」라고 적는다. |
| `next` | 다음에 부를 서브 에이전트와 넘길 메시지. `agent`는 서브 에이전트 이름 그대로(기능 요구사항, 도메인 규칙, API 명세, 디자인, QA 시트, 이슈, FE 구현 하네스, BE 구현 하네스), `message`는 입구 스킬 3절의 문장 그대로. 더 부를 서브 에이전트가 없으면 빈 배열이다. |
| `question` | `needs_user_input`일 때만. 무엇을 왜 묻는지, 고를 수 있는 선택지, 권장안을 한 덩어리로 쓴다. `blocked`일 때는 사람이 손볼 것을 적는다. |
| `side_effects` | 충돌이나 영향 범위. 기능 요구사항 충돌 브리핑은 여기에 담긴다. |

## 「노션 변경 사항」 형식

`changed` 배열을 아래 형식으로 옮긴다. 내용을 베끼지 않고 링크만 단다. 바뀐 문서가 없는 항목은
「없음」과 이유를 적는다.

```markdown
## 노션 변경 사항

- 기능 요구사항: [SEARCH-R12](https://app.notion.com/p/...) 추가. 복사 버튼을 누르면 알림이 뜬다
- QA 시트: [SEARCH-QA-031](https://app.notion.com/p/...) 추가
- 디자인: [탐색 답변 복사](https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=...) 변경 없음, 참고 링크
- 도메인 규칙: 없음 (프론트 길)
- API 명세: 없음 (프론트 길)
```

- PR 본문에서는 첫 번째 `##` 섹션으로 둔다. 그 아래는 기존 PR 템플릿을 따른다.
- 이슈 본문은 세 섹션(`구현 기능 설명`, `TODO`, `메모`)만 허용하므로 `##`를 쓰지 않고
  `구현 기능 설명`의 첫 부분에 굵은 글씨 「노션 변경 사항」과 같은 목록을 둔다.

## 상태 파일

경로는 `${TMPDIR:-/tmp}/knot-feature/<기능-slug>/state.json`이다. 디렉터리 `700`, 파일 `600`.
저장소 밖이며 커밋하지 않는다. 문서 본문, 토큰, 비밀번호, 개인정보를 넣지 않는다.

```json
{
  "request": "요청 원문",
  "existing_issue_url": null,
  "area": "frontend | backend | both",
  "done_condition": "issue | development",
  "remote_write_authorized": false,
  "answers": [{"to": "기능 요구사항", "question": "...", "answer": "..."}],
  "steps": [
    {"agent": "기능 요구사항", "message": "기존과 대조해 업데이트해라", "result": {"status": "done", "changed": [], "next": [], "question": "", "side_effects": []}}
  ],
  "issues": [{"area": "frontend", "number": 0, "url": "..."}],
  "prs": [{"area": "frontend", "url": "..."}]
}
```

`remote_write_authorized`는 사용자가 현재 요청에서 GitHub Issue 생성을 명시적으로 허용했을 때만
`true`다. 이슈 서브 에이전트는 이 값이 `true`일 때만 `--publish`를 쓴다.
