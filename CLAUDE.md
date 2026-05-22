# CLAUDE.md — 프로젝트 컨텍스트 온보딩

> 새 세션을 시작할 때마다 이 문서를 먼저 읽어라.
> 신입 개발자에게 주는 온보딩 문서처럼 작성되었다.

---

## 읽기 순서 (Session Start Protocol)

1. `CLAUDE.md` ← 지금 이 파일
2. `INDEX.md` ← 프로젝트 구조 및 링크 맵
3. `TODOS.md` ← 현재 진행 중인 작업 목록
4. 특정 주제 노트 (`vault/notes/`, `vault/kb/`)

---

## 디렉토리 구조

```
~/
├── src/                        # 모든 소스 코드
│   ├── <project-name>/         # 프로젝트별 코드
│   └── ...
│
└── vault/                      # 지식 작업 공간 (사실 정보)
    ├── projects/               # 프로젝트별 상태·산출물
    ├── notes/                  # 일반 메모·회의록·아이디어
    └── kb/                     # 도메인 지식 베이스 (Knowledge Base)

~/.claude/                      # Claude 설정 (선호도·워크플로)
    ├── CLAUDE.md               # 글로벌 선호도 (이 파일의 상위 레이어)
    ├── skills/                 # 반복 작업 자동화 스크립트
    └── guides/                 # 개인 코딩 가이드·컨벤션
```

### 규칙
- **코드는 `~/src`에만** — vault에 소스 파일 두지 않기
- **vault는 facts** — 프로젝트 상태, 도메인 지식, 산출물
- **`~/.claude`는 config** — 나의 선호도, 워크플로, 취향

---

## 컨텍스트 검색 방법

모델은 `grep`·`glob`으로 컨텍스트를 검색한다. 빠른 탐색을 위해:

```bash
# 키워드로 vault 전체 검색
grep -r "검색어" ~/vault/

# 특정 확장자 파일만 탐색
find ~/src -name "*.ts" | xargs grep "함수명"

# 프로젝트 인덱스 확인
cat ~/vault/projects/<project-name>/INDEX.md
```

---

## INDEX.md 작성 규칙

단순 URL 나열 금지. 반드시 주석(설명)을 붙인다.

```markdown
## 외부 링크

- [Figma 디자인](https://figma.com/...) — 담당: 디자인팀, 내용: v2 메인 화면 와이어프레임
- [API 명세](https://notion.so/...)   — 담당: 백엔드팀, 내용: REST 엔드포인트 전체 목록
- [Jira 보드](https://jira.io/...)    — 담당: PM, 내용: 현재 스프린트 이슈 트래커
```

> 이유: 주석 없는 URL 목록은 모델이 모든 링크를 열어봐야 하므로 컨텍스트 낭비

---

## 조직 컨텍스트 연결 (MCP)

아래 도구들은 MCP로 모델에 연결 가능하다:

| 도구 | 용도 | 연결 상태 |
|------|------|----------|
| Slack | 팀 커뮤니케이션 검색 | `mcp-slack` |
| Google Drive | 문서·스프레드시트 조회 | `mcp-gdrive` |
| Gmail | 메일 검색·작성 | `mcp-gmail` |
| Notion | 위키·회의록 | `mcp-notion` |

> MCP 연결 설정은 `~/.claude/guides/mcp-setup.md` 참고

---

## 용어집 (Glossary)

> 프로젝트 내 약어·코드네임·동명이인 정리. 새 용어 생기면 여기에 추가.

| 용어 | 설명 |
|------|------|
| `AX` | AI eXperience — AI 기반 사용자 경험 제품군 |
| `MFE` | Micro Frontend — Module Federation 기반 분산 프론트엔드 구조 |
| `Host` | MFE에서 Shell 역할을 하는 루트 앱 |
| `Remote` | MFE에서 기능 단위로 분리된 각 서브 앱 |
| `Shell` | = Host, 레이아웃·라우팅·인증 담당 |
| `KB` | Knowledge Base — `vault/kb/` 디렉토리 |
| _(추가 필요)_ | |

## 코딩 원칙 (나의 선호도)

1. **재사용성 우선** — 한 번 쓰고 버리는 코드는 지양
2. **DX를 고려한 추상화** — 팀원이 쓰기 쉬운 API 설계
3. **디자인 패턴 적용** — 상황에 맞는 패턴 선택, 과도한 설계는 경계
4. **양면 검토** — 어떤 선택이든 트레이드오프를 명시
5. **다이어그램 우선** — 아키텍처 설명 시 시각화 먼저

---

## 새 세션 체크리스트

```
[ ] CLAUDE.md 읽음
[ ] INDEX.md에서 현재 프로젝트 구조 파악
[ ] TODOS.md에서 진행 중인 작업 확인
[ ] 필요한 도메인 노트 (vault/kb/) 로드
[ ] MCP 연결 상태 확인 (필요 시)
```

---

## 메모

> 이 파일은 살아있는 문서다. 프로젝트가 바뀌거나 컨벤션이 변경되면 즉시 업데이트한다.
> 마지막 수정: _(날짜 기재)_ | 담당: 승원