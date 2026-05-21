# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 야구 세이버매트릭스 앱

Capacitor 8 기반 Android 앱. 단일 HTML 파일(`www/index.html`)이 WebView에서 동작하며, Supabase DB에 데이터 저장 및 동기화. 인증은 Google 네이티브 로그인.

## 파일 구조

```
www/
  index.html          — 전체 앱 (HTML + CSS + JS, ~3900줄)
  supabase-client.js  — Supabase 클라이언트 초기화 + SB 헬퍼 객체
  supabase.umd.js     — Supabase JS SDK (번들)
  capacitor.js        — Capacitor 브릿지
  sw.js               — Service Worker (오프라인 캐시)

android/
  app/src/main/java/com/opkjw/savermatrix/
    MainActivity.java         — Capacitor BridgeActivity + 플러그인 등록
    GoogleSignInPlugin.java   — 네이티브 Google 로그인 커스텀 플러그인
  app/build.gradle            — play-services-auth:21.2.0 의존성 포함

capacitor.config.ts   — appId: com.opkjw.savermatrix, androidScheme: https
```

> **주의**: `www/index.html` `<head>`에 반드시 `capacitor.js`, `supabase-client.js` script 태그가 있어야 함. 없으면 Supabase/Google 로그인이 동작하지 않음.

## HTML 골격

```
#login-overlay   ← 로그인/초대코드 화면 (미로그인 시 표시)
#app
  #ghdr          ← 경기 정보 헤더 (renderGHdr)
  .content#ct    ← 탭 컨텐츠 (renderCt)
  .tabbar#tbr    ← 하단 탭 바 (renderTabs)
#toast           ← 알림 토스트
#modal-root      ← 모달 컨테이너
```

## 탭 구성 (S.tab: 0~4)

| 탭 | 이름 | 주요 함수 |
|---|---|---|
| 0 | 타자 입력 | `rBatTab()` → `rBatPSel()` → `rOCSel()` → `rExtras()` |
| 1 | 투수 입력 | `rPitTab()` → `rOCSel('pit')` / `rPitRunInput()` |
| 2 | 기록 | `rLog()` — 경기별 타자/투수 기록 목록 |
| 3 | 통계 | `rStats()` — 타자/투수 기본+세이버매트릭스 테이블 |
| 4 | 설정 | `rSettings()` — 로그아웃, 동기화, 선수 관리 |

## 인증 흐름

```
앱 시작
  └─ supabase:ready 이벤트
       └─ SB.getProfile() 로 세션 복원
            ├─ teamId 있음 → loadFromSupabase() → r()
            └─ teamId 없음 → showInviteCodeView()

로그인 버튼 (Google 로그인)
  └─ doGoogleLogin()
       └─ Capacitor.Plugins.GoogleAuth.signIn()   ← 네이티브 계정 선택 팝업
            └─ result.idToken
                 └─ SupabaseClient.auth.signInWithIdToken({ provider:'google', token })
                      └─ SB.getProfile()
                           ├─ teamId 있음 → loadFromSupabase()
                           └─ teamId 없음 → showInviteCodeView()

초대 코드 입력
  └─ doApplyInviteCode()
       └─ SB.applyInviteCode(code) — teams 테이블에서 코드 조회 → profiles 업데이트
            └─ loadFromSupabase()
```

### GoogleSignInPlugin (커스텀 Capacitor 플러그인)
- `google-services.json` 불필요 — `play-services-auth` SDK만 직접 사용
- Web Client ID로 `requestIdToken` → JS에 `{ idToken, email, displayName }` 반환
- `signIn()` 호출 시 이전 세션 `signOut()` 후 계정 선택 팝업 표시
- `@codetrix-studio/capacitor-google-auth` npm 패키지와 이름 충돌 발생하므로 **설치 금지**

## 역할 시스템

| DB role | 앱 role (SB.mapRole) | 권한 |
|---|---|---|
| `admin` | `admin` | 감독/코치 — 전체 기록 입력·편집 |
| `recorder` | `recorder` | 기록자 — 전체 기록 입력·편집 |
| `parent` | `user` | 학부모 — 자녀 통계 조회만 |

- 팀 생성은 Supabase 대시보드에서 직접 수행 (앱 내 팀 생성 없음)
- 초대 코드 3종: `invite_code`(학부모), `invite_code_recorder`(기록자), `invite_code_admin`(감독)

## 상태 객체 S (주요 필드)

```js
S = {
  tab,                                    // 현재 탭 인덱스
  role,                                   // 'admin' | 'recorder' | 'user'
  teamId,                                 // Supabase teams.id (UUID)
  bs, bp, bo, brbi, bsb, bcs, bzone,     // 타자 입력 단계/선택값
  curPit, pitSub,                         // 투수 입력 상태
  sprayPlayer,                            // 통계 탭 스프레이 차트 선수
  logGameId,                              // 기록 탭 선택 경기
  game, gcnt, games,                      // 현재/전체 경기
  blog, pit_bf, pit_runs,                 // 기록 데이터 배열 (메모리)
  lastSync, syncing, loading,             // 동기화 상태
}
```

## Supabase DB 구조

| 테이블 | 주요 컬럼 |
|---|---|
| `profiles` | `id`, `role`, `team_id`, `nickname`, `player_no` |
| `teams` | `id`, `name`, `invite_code`, `invite_code_recorder`, `invite_code_admin` |
| `games` | `id`, `team_id`, `date`, `opponent`, `type`, `game_no`, `status` |
| `bat_log` | `id`, `team_id`, `game_id`, `player_no`, `oc`, `zone`, `run`, `rbi`, `sb`, `cs` |
| `pit_bf` | `id`, `team_id`, `game_id`, `player_no`, `oc` |
| `pit_runs` | `id`, `team_id`, `game_id`, `player_no`, `earned` |
| `players` | `team_id`, `no`, `name`, `role`, `pos`, `siblings` — unique(`team_id`,`no`,`role`) |

## 데이터 흐름

- **불러오기**: `loadFromSupabase()` → `SB.fetchTeamData(teamId)` → S 상태에 병합
- **타자 기록**: `selBat()` → `selOC()` → `saveBat()` → `S.blog[]` push + `SB.upsertBatLog()`
- **투수 기록**: `selPit()` → `pitOC()` → `S.pit_bf[]` + `SB.upsertPitBf()`
- **실점**: `addPitRun()` → `S.pit_runs[]` + `SB.upsertPitRun()`
- **득점**: `addBatRun()` — `S.blog` 마지막 타석 `run` 필드 증가
- **편집**: `showEditBatModal/showEditPitBfModal/showEditPitRunModal()` → `renderEditModal()` → `confirmEditEntry()`
- 모든 DB 쓰기는 fire-and-forget (`.catch(function(){})`) — UI 블로킹 없음

## SB 헬퍼 (supabase-client.js)

```
SB.getProfile()         — 현재 유저 profiles 조회
SB.applyInviteCode(code)— 초대코드로 role+team_id 설정
SB.fetchTeamData(teamId)— games/bat_log/pit_bf/pit_runs/players 일괄 조회
SB.upsertGame / deleteGame
SB.upsertBatLog / deleteBatLog
SB.upsertPitBf / deletePitBf
SB.upsertPitRuns / deletePitRun
SB.upsertRoster         — onConflict: 'team_id,no,role'
SB.signOut
```

## 세이버매트릭스 계산

- **타자**: `batAgg()` — AVG/OBP/SLG/OPS/wOBA/wRC+/ISO/BABIP/WAR
  - 엔트리 키: `e.pno` (player_no). `e.pn` 은 존재하지 않는 필드 — 사용 금지
  - ROSTER 조회: `ROSTER.find(x => x.no === e.pno)` 로 선수 이름 확인
- **투수**: `calcPitStats(pno, gid)` / `pitAgg()` — ERA/WHIP/FIP/K9/BB9
- wRC+ 리그 평균 wOBA는 팀 내 데이터 기반 자체 계산

## 스프레이 차트 (`rSprayChart`)

- SVG 팬(부채꼴) 차트, viewBox `350×215`, 홈플레이트 기준
- 5구역: 3루수/유격수/중앙/2루수/1루수 (각도 −45°~+45°)
- zone 값: 외야 `LF/LC/CF/RC/RF`, 내야 `3B/SS/2B/1B`
- `BIP_OC` 결과에서만 방향 선택 가능

## 빌드 / 배포

```bash
# www → Android 동기화
npx cap sync android

# 디버그 APK 빌드
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew assembleDebug

# 에뮬레이터 설치
/opt/homebrew/share/android-commandlinetools/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 수정 시 주의사항

- JS 문법 오류 검증 필수 (함수들이 날아가는 이슈 있었음)
- `onclick` 안 따옴표는 `&apos;` 엔티티 사용
- 문자열 연결은 template literal 대신 `+` 연결 사용 (중첩 오류 방지)
- 전체 렌더는 `r()`, 컨텐츠만 갱신할 때는 `renderCt()` 사용
- bat_log/pit_bf 엔트리의 선수 번호 필드는 `e.pno` (숫자). `e.pn` 사용 금지
- `sw.js` 캐시 버전은 코드 변경 후 반드시 업 (예: `baseball-app-v20260518f`)
