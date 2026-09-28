# ZIPUP AI

CREATION ZIPUP 사내 AI 이미지·영상 생성 플랫폼입니다.
Higgsfield API와 fal.ai를 한곳에 묶어, 가입 승인 → 팀별 권한·예산 → 생성 → 셀렉·공유까지 한 흐름으로 처리합니다.

- **이미지**: Seedream 5.0 Pro · Nano Banana Pro · Nano Banana 2 · GPT Image 2.5 · GPT Image 2.0
- **영상**: MiniMax H3 · Seedance 2.5 (드래프트 모드 포함)
- **팀**: AI제작팀 · 기획팀 · 연출팀 · 엔터팀 · AI캐릭터팀 (관리자 화면에서 추가·수정 가능)

---

## 주요 기능

| 영역 | 내용 |
| --- | --- |
| 가입·권한 | 사내 이메일로 가입 신청 → 관리자가 팀·권한 지정 후 승인. 권한: 최고관리자 / 팀장 / 멤버 / 뷰어 |
| 예산 | 팀별·개인별 월 한도(USD). 한도의 N%를 넘으면 본인·팀장·관리자에게 알림, 넘으면 새 생성 차단. 실패·검열은 합산 안 함 |
| 스튜디오 | 모델별 파라미터, 레퍼런스·시작/끝 프레임 드래그앤드롭, 예상 비용 표시, 여러 장 동시 생성, 이전 설정 기억, ⌘↵로 생성 |
| Seedance 드래프트 | 480p로 싸게 여러 테이크를 뽑고, 마음에 드는 것만 720p 최종 렌더 |
| 노드 캔버스 | 프롬프트 → 이미지 → 영상 노드 연결, 노드별 실행 또는 순서대로 **전체 실행**, 템플릿 제공 |
| 라이브러리 | 전사 결과물 통합 검색(고급 문법·한/영 동의어), 별점·픽/탈락·컬러 라벨·태그·즐겨찾기, 비교 보기, ZIP 다운로드, 휴지통 |
| 프로젝트 공유 | 비공개 / 팀 공개 / 전사 공개 + 멤버 초대(편집자·뷰어), 컬렉션, 코멘트(@멘션 알림) |
| 자동 파일명 | `{project}_{model}_{date}_{seq}` 같은 규칙으로 저장·다운로드 파일명 자동 생성 (관리자가 규칙 변경) |
| 프롬프트 라이브러리 | 모델·설정까지 함께 저장, 팀·전사 공유, 한 번에 스튜디오로 불러오기 |
| 관리자 | 사용량 대시보드(일별·팀별·모델별·상위 사용자, 표 보기), 승인 대기열, 팀·예산, 모델 켜기/끄기·단가·공지, 시스템 설정, 감사 로그 |
| 기타 | ⌘K 통합 검색·이동, 실시간 대기열 표시·완료 알림, 다크/라이트 테마, 모바일 대응 |

### 모델과 공급자

| 모델 | 공급자 | 비고 |
| --- | --- | --- |
| Seedream 5.0 Pro | fal.ai | Higgsfield API에 없어 fal.ai로 연결 |
| Nano Banana Pro | fal.ai | 〃 |
| Nano Banana 2 | fal.ai | 〃 |
| GPT Image 2.5 (Flare / Sunburst) | Higgsfield | 비용은 제출 직전 Higgsfield 견적 API로 계산 |
| GPT Image 2.0 | Higgsfield | 〃 |
| MiniMax H3 | Higgsfield | 2K, 5–15초 |
| Seedance 2.5 | Higgsfield | 생성·편집·연장, 드래프트(480p) |

> 공급자 키가 없으면 해당 모델은 **모의 생성(MOCK)** 으로 동작해 화면·흐름을 그대로 테스트할 수 있습니다(개발 환경 또는 `MOCK_GENERATION=1`).

---

## 로컬에서 실행하기

필요: Node.js 22+, pnpm 10+, PostgreSQL 15+ (`pg_trgm` 확장 사용)

```bash
pnpm install
cp .env.example .env.local        # DATABASE_URL, BETTER_AUTH_SECRET 정도만 채워도 실행돼요
pnpm db:migrate                   # 테이블 생성 (pg_trgm 확장 포함)
pnpm dev                          # http://localhost:3000
```

- **처음 가입한 사람이 최고관리자**가 됩니다(`ADMIN_EMAILS`에 적은 이메일도 관리자). 이후 가입자는 승인 대기 상태로 시작해요.
- 키가 없으면 모의 생성으로 동작하고, 파일은 `.data/storage`에 저장됩니다.

로컬 Postgres가 없다면 Docker로 띄울 수 있어요.

```bash
docker run -d --name zipup-db -p 5432:5432 \
  -e POSTGRES_USER=zipup -e POSTGRES_PASSWORD=zipup -e POSTGRES_DB=zipup postgres:17
```

---

## 배포하기 (Vercel + Supabase + Cloudflare R2)

### 1. Supabase (데이터베이스)
1. 새 프로젝트를 **Seoul (ap-northeast-2)** 리전에 만듭니다.
2. Project Settings → Database → Connection string에서 두 주소를 복사합니다.
   - **Transaction pooler (포트 6543)** → `DATABASE_URL` (앱이 사용)
   - **Session pooler (포트 5432)** 또는 Direct → `DIRECT_DATABASE_URL` (마이그레이션용)
3. 내 컴퓨터에서 테이블을 만듭니다.
   ```bash
   DIRECT_DATABASE_URL="postgresql://..." pnpm db:migrate
   ```
   스키마를 바꾼 뒤에는 `pnpm db:generate`로 마이그레이션 파일을 만들고 다시 `pnpm db:migrate` 하세요.

### 2. Cloudflare R2 (결과물 저장)
Higgsfield 결과 URL은 7일 뒤 만료되므로, 완성된 파일은 바로 R2로 복사해 영구 보관합니다. **운영에서는 R2 설정이 필수**예요.
1. R2 → 버킷 만들기 (예: `zipup-ai`). 공개 설정은 필요 없어요(서명된 URL 사용).
2. Manage R2 API Tokens → **Object Read & Write** 토큰 발급 → `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
3. `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_BUCKET=zipup-ai`
4. 버킷 → Settings → **CORS 정책**에 추가 (브라우저에서 바로 업로드·ZIP 다운로드)
   ```json
   [
     {
       "AllowedOrigins": ["https://ai.creationzipup.com", "http://localhost:3000"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag", "Content-Length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### 3. API 키
- **Higgsfield**: https://console.higgsfield.ai 에서 API 키 발급 → `HF_CREDENTIALS=KEY_ID:KEY_SECRET`
- **fal.ai**: https://fal.ai/dashboard/keys → `FAL_KEY`

### 4. Vercel
1. GitHub 저장소를 Import 합니다. (Framework: Next.js, 빌드 설정은 기본값)
2. Environment Variables에 `.env.example`의 값을 넣습니다.
   - `APP_URL`은 실제 접속 주소(예: `https://ai.creationzipup.com`). 공급자 **웹훅**이 이 주소로 결과를 알려줘요.
   - `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
   - `CRON_SECRET`: 임의의 긴 문자열 (Vercel Cron이 자동으로 인증 헤더에 넣어요)
3. `vercel.json`에 서울 리전(`icn1`)과 **매분 실행되는 Cron**(`/api/cron/tick`)이 설정돼 있어요. 대기열 제출, 놓친 웹훅 복구, 결과 저장 재시도를 맡습니다.
   - 매분 Cron은 **Pro 플랜**에서 동작해요. Hobby 플랜이면 배포가 거부되니 `schedule`을 `0 0 * * *`(하루 1번)으로 바꾸세요. 이 경우에도 화면 폴링과 웹훅으로 정상 동작하지만, 브라우저를 닫은 작업의 복구가 느려질 수 있어요.
4. 배포 후 사이트에 **가장 먼저 가입**한 사람이 최고관리자가 됩니다. 관리자 → 설정에서 **허용 이메일 도메인**(예: `creationzipup.com`)을 지정하는 걸 권장해요.

### 배포 후 첫 설정 체크리스트
- [ ] 관리자 → 팀·예산: 팀별 월 한도 입력
- [ ] 관리자 → 설정: 허용 도메인, 파일명 규칙, 예산 경고 기준, 동시 실행 한도(Higgsfield 플랜에 맞게)
- [ ] 관리자 → 모델·가격: 쓰지 않을 모델 끄기, 공지 입력
- [ ] 관리자 → 개요: 공급자 두 곳이 "연결됨"인지 확인

---

## 알아두면 좋은 점

- **Seedance 드래프트 → 최종 렌더**: Seedance 2.5 API에는 시드(seed) 값이 없어서 드래프트와 *똑같은* 결과를 720p로 다시 뽑을 수 없습니다. 그래서 최종 렌더는 두 가지 중에서 고릅니다.
  1. **이 테이크 살리기**: 드래프트 영상을 원본으로 `video-edit`에 넣어 720p로 다시 렌더 — 구도·움직임이 유지되고, 비용은 원본 길이 × 2 토큰 수준
  2. **같은 설정으로 새로 생성**: 720p로 새로 생성 — 더 저렴하지만 다른 테이크가 나와요
- **예상 비용과 실제 청구**: 예산 계산은 앱의 예상 금액 기준입니다(Higgsfield 모델은 견적 API, fal.ai 모델은 단가표). 실제 청구는 각 공급자 콘솔에서 확인하고, 가격이 바뀌면 관리자 → 모델·가격에서 단가를 수정하세요.
- **동시 실행 한도**: 한도를 넘는 요청은 사내 대기열에서 순서대로 제출됩니다. Higgsfield 계정의 동시 실행 한도에 맞춰 관리자 → 설정에서 조정하세요.
- **로고**: 전달받은 이미지를 바탕으로 SVG로 다시 그린 워드마크입니다(`src/components/brand/logo.tsx`). 공식 SVG 파일이 있으면 그 경로로 교체하면 됩니다.
- **개인 작업공간**: 가입 승인 시 사람마다 비공개 작업공간이 자동으로 만들어지고, 스튜디오 기본 저장 위치가 됩니다.

---

## 사용 팁

### 라이브러리 검색 문법

| 입력 | 의미 |
| --- | --- |
| `네온 도시` | 모든 단어 포함 · 한/영 동의어 자동 확장 (고양이 ↔ cat) |
| `"red dress"` | 정확한 구문 |
| `-흐림` | 제외 |
| `#인물` | 태그 |
| `@홍길동`, `@나` | 만든 사람 / 내가 만든 것 |
| `model:seedream` | 모델 (시드림, 나노바나나, gpt, h3, 시댄스) |
| `project:신제품`, `team:기획팀` | 프로젝트 / 팀 |
| `is:video` `is:pick` `is:fav` `is:unrated` | 영상 / 픽 / 즐겨찾기 / 별점 없음 |
| `★4`, `rating>=4` | 별점 4점 이상 |
| `color:red` | 컬러 라벨 |
| `date:week`, `after:2026-09-01`, `before:2026-09-30` | 기간 (한국 시간) |
| `ratio:9:16` | 비율 |

### 단축키

| 키 | 동작 |
| --- | --- |
| `⌘K` / `Ctrl+K`, `/` | 통합 검색·이동 |
| `⌘↵` | 스튜디오에서 생성 |
| `1`–`5`, `0` | 별점 / 별점 지우기 |
| `P` / `X` / `U` | 픽 / 탈락 / 해제 |
| `6` `7` `8` `9` | 빨강·노랑·초록·파랑 라벨 |
| `F` | 즐겨찾기 |
| `⌘`/`Shift` + 클릭 | 여러 개 선택 |
| `←` `→` | 라이트박스에서 이전·다음 |

---

## 개발

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 개발 서버 |
| `pnpm build` / `pnpm start` | 운영 빌드 / 실행 |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | 린트 · 타입 검사 · 단위 테스트(Vitest) |
| `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:studio` | 마이그레이션 생성 · 적용 · DB 브라우저 |
| `node e2e/*.mjs` | Playwright 화면 점검 스크립트 (개발 서버 실행 중일 때) |

**구성**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · better-auth · Drizzle ORM + PostgreSQL · TanStack Query · React Flow · Recharts · sharp

```
src/
  app/                 페이지와 API (App Router)
    (auth)/            로그인·가입
    (app)/             스튜디오, 라이브러리, 프로젝트, 캔버스, 프롬프트, 설정, 관리자
    api/               REST API · 웹훅 · Cron
  components/          UI (studio, assets, canvas, projects, admin, shell, ui …)
  lib/
    models/registry.ts 모델 정의 (파라미터, 요청 생성, 비용 계산)
    providers/         Higgsfield · fal.ai · mock 공급자
    services/          생성 대기열, 예산, 검색, 권한, 관리자 로직
    search/            검색 문법 파서 · 동의어
    storage/           R2(S3) · 로컬 저장소
drizzle/               DB 마이그레이션
```

생성 흐름: `POST /api/generations` → 예산 확인(트랜잭션 + advisory lock) → 사내 대기열(`pending`) → 공급자별 동시 실행 한도 안에서 제출 → 웹훅·폴링·Cron으로 상태 확인 → 결과를 R2로 복사하고 썸네일·파일명·검색 인덱스 생성 → 알림.
