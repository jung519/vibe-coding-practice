# 실습 준비 자동 점검 — 바이브 코딩 기초반

> **사용법**: 이 파일을 작업 폴더에 두고 터미널에서 Claude Code를 실행한 뒤,
> **"이 prep.md로 이 컴퓨터의 실습 준비 상태를 점검해줘"** 라고 요청하세요.
>
> **완전 자동이 아닙니다.** 로컬 도구는 (동의 후) 설치까지 도와주지만,
> **사이트 가입은 본인이 직접** 합니다. Claude는 확인·안내만 합니다.

## Claude Code 실행 지침 (에이전트가 따를 순서)
1. **로컬 도구**: 각 `점검` 명령을 실행해 설치 여부·버전을 확인한다. 미설치면 감지한 OS(macOS/Windows)에 맞는 방법으로 **사용자 동의를 받은 뒤** 설치한다(공식 배포처 우선).
2. **수동 확인 도구**(CLI 점검 불가): 설치·동작 여부를 사용자에게 질문한다.
3. **계정**: 각 항목을 "가입·로그인 되나요?"로 **질문**한다. 안 되어 있으면 URL을 안내한다 — **가입은 사용자가 직접 하며, Claude가 대신 가입하지 않는다.**
4. **보고서**: 마지막에 아래 [준비 상태 보고서] 형식으로 ✅/❌/❓ 요약한다.

> 기초반은 **npm**을 씁니다(pnpm 불필요). 별도 API 키도 필요 없습니다.

## 1) 로컬 도구 — 점검 + (동의 후) 설치
| 도구 | 점검 명령 | 설치 |
|---|---|---|
| Node.js LTS | `node -v` · `npm -v` · `npx --version` | nodejs.org(LTS) · mac `brew install node` · win `winget install OpenJS.NodeJS.LTS` |
| Git | `git --version` | git-scm.com (Windows 설치 시 Git Bash 포함) |
| Claude Code | `claude --version` | `npm install -g @anthropic-ai/claude-code` |
| VS Code (권장) | `code --version` | code.visualstudio.com |

**수동 확인**(CLI 점검 없음, 질문으로 확인): Obsidian 설치·실행 / 최신 브라우저(Chrome·Edge).
> Windows는 Git Bash 터미널, macOS는 기본 터미널 사용. 작업 폴더 경로는 영문 권장.

## 2) 계정 — 대화형 확인 (가입은 본인)
| 서비스 | 확인 질문 | 가입 URL | 처음 쓰는 날 |
|---|---|---|---|
| Claude 웹 | claude.ai 로그인 되나요? | claude.ai | Day 02 |
| GitHub | 로그인 되나요? | github.com/signup | Day 01 |
| Vercel | GitHub 연동 로그인 되나요? | vercel.com/signup | Day 01 |
| Supabase | 콘솔 접속 되나요? | supabase.com/dashboard | Day 11 |

## 3) 그날 준비 (미리 설치 불필요 — 인지만)
Mermaid(Day 07) · 한글 뷰어(Day 09) · Zapier(Day 12·17) · Gmail(Day 12·17) · Telegram(Day 12) · Umami(Day 14). 각 실습 당일 무료 가입/사용.

## 4) 사전 과제 — 확인만
- 내 사업 아이템: ① 이름 ② 한 줄 설명 ③ 왜 좋은지 ④ 걱정되는 점.
- Claude 대화 → Obsidian(`.md`) 저장 습관.

## 준비 상태 보고서 (Claude Code가 마지막에 출력할 형식)
```
[로컬 도구]  Node ✅  npm ✅  Git ✅  Claude Code ✅  VS Code ✅/❌
[수동 확인]  Obsidian ❓  브라우저 ❓
[계정]      Claude ✅  GitHub ✅  Vercel ✅  Supabase ❓(안내함)
[사전 과제]  사업 아이템 4항목 ❓
[종합]      Day 01 시작 가능 여부 + 남은 준비 항목 목록
```
