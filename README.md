# ZIPUP AI

CREATION ZIPUP 사내 AI 이미지·영상 제작 시스템입니다.
Higgsfield API와 fal.ai를 한곳에 묶어, 가입 승인 → 팀별 권한·예산 → 프로젝트·컷별 생성 → OK/NG 판정 → 내보내기까지 한 흐름으로 처리합니다.

- **이미지**: Seedream 5.0 Pro · Nano Banana Pro · Nano Banana 2 · GPT Image 2.5 · GPT Image 2.0
- **영상**: MiniMax H3 · Seedance 2.5 (드래프트 모드 포함)
- **팀**: AI제작팀 · 기획팀 · 연출팀 · 엔터팀 · AI캐릭터팀 (관리자 화면에서 추가·수정 가능)

---

## 주요 기능

| 영역 | 내용 |
| --- | --- |
| 가입·권한 | 사내 이메일로 가입 신청 → 관리자가 팀·권한 지정 후 승인. 권한: 최고관리자 / 팀장 / 멤버 / 뷰어 |
| 예산 | 팀별·개인별 월 한도(USD). 한도의 N%를 넘으면 본인·팀장·관리자에게 알림, 넘으면 새 생성 차단. 실패·검열은 합산 안 함 |
| 프롬프트 데스크 | 스튜디오의 주인공은 큰 프롬프트 편집기. **버전은 지금 컷 안에서만** 올라가요(생성할 때 자동, ⌘S로 메모와 함께, 버전마다 그 버전으로 나온 테이크). 변경 비교에서 바뀐 구간마다 **원래 뜻 → 바뀐 뜻**(한국어), 영어·중국어 프롬프트의 구간별 한국어 직역, 한국어를 고치면 영어 표현 추천, 한국어 → 영어·중국어 변환, `@img8` → `@img3` 같은 언급 바꾸기 |
| 듀얼 모니터 | 결과를 다른 모니터의 별도 창으로 띄우고(크롬·엣지는 자동으로 다른 화면에 배치), 프롬프트 창은 편집에 집중. 결과 창에서 "프롬프트 불러오기·레퍼런스로"를 누르면 프롬프트 창에 바로 반영 |
| 스튜디오 | 모델별 파라미터, 레퍼런스·시작/끝 프레임 드래그앤드롭, 예상 비용 표시, 여러 장 동시 생성, 이전 설정 기억, ⌘↵로 생성, 결과 요청별/갤러리 보기 |
| Seedance 드래프트 | 공식 드래프트 모드: 480p로 싸게 여러 테이크를 뽑고, 고른 테이크를 **같은 구도·움직임 그대로 1080p로 완성** (7일 이내) |
| 노드 캔버스 | 프롬프트 → 이미지 → 영상 노드 연결, 노드별 실행 또는 순서대로 **전체 실행**, 실행 결과가 쌓이는 **결과 리스트**, 템플릿 제공 |
| 라이브러리 | 전사 결과물 통합 검색(고급 문법·한/영 동의어), 별점·OK/KEEP/NG·컬러 라벨·태그·즐겨찾기, 비교 보기, ZIP 다운로드, 휴지통 |
| 프로젝트 › 컷 | 컷별 테이크 번호·담당·지금 생성 중인 사람·OK/NG 모아 보기, 프로젝트/컷 폴더와 판정이 붙은 이름으로 내보내기 |
| 프로젝트 공유 | 비공개 / 팀 공개 / 전사 공개 + 멤버 초대(편집자·뷰어), 컬렉션, 코멘트(@멘션 알림) |
| 자동 파일명 | `{project}_{model}_{date}_{seq}` 같은 규칙으로 저장·다운로드 파일명 자동 생성 (관리자가 규칙 변경) |
| 프롬프트 라이브러리 | 저장 · 받은 · 팀·전사 · 보낸이 한곳에(스튜디오와 /prompts 같은 곳). 사람·팀·전사로 보내기 + 알림 + 프롬프트마다 대화. **출처(프로젝트 / 컷)** 별로 묶고 거르기 |
| 관리자 | 사용량 대시보드(일별·팀별·모델별·상위 사용자, 표 보기), 승인 대기열, 팀·예산, 모델 켜기/끄기·단가·공지, 시스템 설정, 감사 로그 |
| 기타 | ⌘K 통합 검색·이동, 실시간 대기열 표시·완료 알림, 다크 전용, 모바일 대응 |

### 모델과 공급자

| 모델 | 공급자 | 비고 |
| --- | --- | --- |
| 모델 | 기본 공급자 | 대체 | 비고 |
| --- | --- | --- | --- |
| Seedream 5.0 Pro | fal.ai | – | Higgsfield API에 없음 |
| Nano Banana Pro | fal.ai | – | 〃 |
| Nano Banana 2 | fal.ai | – | 〃 |
| GPT Image 2.5 (Flare / Sunburst) | Higgsfield | fal.ai | Higgsfield로 보낼 때는 견적 API로 비용 계산 |
| GPT Image 2.0 | Higgsfield | fal.ai | 〃 |
| MiniMax H3 | Higgsfield | fal.ai | 2K, 5–15초 |
| Seedance 2.5 | fal.ai | Higgsfield | 생성·편집·연장, 1080p, **공식 드래프트 → 1080p 완성** |

- 기본 공급자 키가 없으면 대체 공급자로 자동 전환돼요. 관리자 → 모델·가격에서 모델별로 공급자를 고정할 수도 있어요.
- 공급자 키가 모두 없으면 개발 환경에서는 **모의 생성(MOCK)** 으로 동작해 화면·흐름을 그대로 테스트할 수 있어요(`MOCK_GENERATION=1`로 강제 가능).

### 노드 캔버스
- **이어 붙이기 추천**: 포트에서 선을 끌어 빈 곳에 놓으면 이어 붙이기 좋은 노드를 추천하고, 고르면 자동으로 연결돼요. 빈 곳 더블클릭이나 `/`로 노드를 검색해 추가해요.
- **결과 리스트**: 이미지·영상 생성 노드의 출력을 이으면, 실행할 때마다 결과가 쌓여요(여러 노드를 한 리스트에 이어도 돼요. 다른 사람이 돌린 결과도 보여요). 결과마다 OK·KEEP·NG를 누르고, 크게 보며 넘기고, ZIP으로 받고, 끌어서 캔버스에 놓으면 입력 노드가 돼요. **OK한 결과만 오른쪽 출력으로 다음 노드에 넘어가요**: 레퍼런스로 이으면 한꺼번에, 시작·끝 프레임이나 영상 편집으로 이으면 OK한 것마다 한 번씩 돌아요. 생성 노드의 "결과 리스트" 버튼을 누르면 옆에 리스트를 만들어 이어 줘요.
- **반복 입력**: 여러 줄(카메라 앵글, 의상 …)이나 여러 이미지를 넣고 생성 노드에 연결하면 항목마다 한 번씩 실행해요. 여러 개면 조합 수만큼 돌아요(최대 24).
- **조작감**: Figma식 이동(휠=이동, ⌘/Ctrl+휠·핀치=확대, 빈 곳 끌기=선택) 또는 휠 확대 중에서 고를 수 있어요. 다른 노드에 맞춰 붙는 스마트 가이드, 격자 스냅, ⌘Z 되돌리기, ⌘C/⌘V/⌘D, 방향키 미세 이동, ⇧1 전체 보기를 지원해요.
- **스케치·레이저**: 펜(P)으로 캔버스에 그려 설명하고(저장됨), 레이저(L)는 잠깐 보였다 사라져요. 지우개(E)로 지워요.
- **참여자**: 같은 캔버스를 연 사람의 커서·펜·레이저가 실시간으로 보여요(Supabase Realtime, `SUPABASE_PUBLISHABLE_KEY`). 혼자일 때는 메시지를 보내지 않아 무료 한도를 아껴요.
- **노드 목록**: 오른쪽 위 목록 버튼으로 모든 노드와 실행 상태를 보고 눌러서 이동해요.

### 번역·사전 (한국어 대조 · 단어 뜻 · 한국어로 바꾸기)
프롬프트 작업의 기본은 **싸고 빠른 번역 API + 사내 용어집**이고, AI(LLM)는 필요할 때만 써요.

| 순서 | 무엇 | 비용 |
|---|---|---|
| 1 | **사내 용어집** (`src/lib/translate/glossary.ts`, 약 760개 용어·1,260개 표기) — 달리·림 라이트·필름 그레인처럼 현장 용어를 먼저 풀어 줌 | 무료 · 즉시 |
| 2 | **번역 API** — 구간별 직역, 단어 사전(Azure), 한국어 → 영어 후보 | Azure F0 월 200만 자 무료 |
| 3 | **AI(LLM)** — 번역 API가 없을 때 대신 번역, "AI 추천" 버튼 | 호출당 1원 미만 |

- 번역 결과는 구간·단어 단위로 **회사 전체가 캐시를 함께 써서** 같은 문장은 다시 요금이 들지 않아요.
- 스튜디오: 단어에 마우스를 올리면 뜻(파파고식), **더블클릭**하면 한국어로 원하는 뜻을 적어 영어 후보를 골라 바로 바꿔요. 드래그로 여러 단어를 골라도 뜻이 떠요.
- 키는 환경 변수(`AZURE_TRANSLATOR_KEY` 등) 또는 **관리자 → 설정 → 번역·사전 엔진**에서 넣어요(암호화 저장, 저장 전에 키 확인). 이번 달 사용량과 무료 한도도 거기서 보여요.

| 엔진 | 무료 구간 | 넘으면 | 비고 |
|---|---|---|---|
| Azure Translator | 월 200만 자 | 100만 자당 $10 | 영↔한·영↔중 사전 지원 (추천) |
| Papago (NAVER Cloud) | 없음 | 유료 | 한국어 품질 최상 |
| Google Translate | 월 50만 자 | 100만 자당 $20 | |
| DeepL | (신규 무료 플랜 종료) | 유료 | 기존 키가 있을 때 |

### AI 추천 (LLM)
| 방식 | 설정 | 비용 |
|---|---|---|
| **fal.ai OpenRouter (기본)** | `FAL_KEY`만 있으면 자동 사용 | Gemini 2.5 Flash-Lite 기준 호출당 $0.001 미만 |
| Google AI Studio 무료 키 | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | 무료(한도 내). 무료 등급은 입력이 품질 개선에 쓰일 수 있음 |
| OpenAI 호환 API (OpenRouter·Groq 등) | 위와 같음 | 모델별 |

### 프로젝트 › 컷 › 테이크

- 프로젝트를 컷(C001, C002… 또는 S02_C05처럼 원하는 번호)으로 나눌 수 있어요. **컷 없이 프로젝트에 바로 쌓는 방식도 그대로** 써요.
- 스튜디오에서 컷을 고르고 생성하면(프로젝트마다 마지막 컷을 기억) 결과마다 **테이크 번호**가 붙어요 (C003 · T07).
- 컷 보드: 컷마다 상태(대기·작업 중·검토·확정), 담당, **지금 생성 중인 사람**, 최근 테이크, OK·KEEP·NG 개수. 끌어서 순서 바꾸기, 여러 개 한 번에 만들기.
- 클립 판정 **OK / KEEP / NG** — 단축키 `P` / `K` / `X`. 라이브러리·클립 보기·스튜디오 결과 어디서나.
- **내보내기**(컷 또는 프로젝트 전체, OK만 / OK+KEEP / 전체): ZIP 안이 `프로젝트/컷/` 폴더로 나뉘고, 파일 이름 끝에 판정(`…_C003_T07_seedance_OK.mp4`)이 붙고, 샷 리스트 `shotlist.csv`(컷·테이크·판정·프롬프트·모델·작업자)가 함께 들어가요. 압축은 브라우저에서 해서 서버 비용이 없어요.
- 파일 이름에 컷·테이크가 들어가요. 컷 번호를 바꾸거나 클립을 다른 컷으로 옮기면 이름도 따라 바뀌어요.

### 프롬프트: 컷 버전과 라이브러리

- **컷 버전** — 스튜디오 맨 위 "작업 위치"(프로젝트 / 컷)에서 고른 컷 안에서만 버전이 올라가요. 생성할 때 프롬프트가 바뀌었으면 자동으로 새 버전, ⌘S는 메모를 붙여 저장. 버전 기록에서 버전마다 그 버전으로 나온 테이크를 봐요. 컷 없는 프로젝트는 프로젝트 안에서 올라가요. 라이브러리에는 섞이지 않아요.
- **라이브러리** — 스튜디오의 "라이브러리"와 /prompts는 같은 곳이에요. 탭: 저장(내가 저장) · 받은(나에게 온 것, 안 본 것 표시) · 팀·전사 · 보낸.
- **출처** — 저장하거나 보낼 때 어느 프로젝트의 어느 컷에서 나왔는지 기록해요. 목록은 출처(프로젝트 / 컷)별로 묶이고, 왼쪽에서 프로젝트·컷을 골라 걸러요. 스튜디오에서 열면 지금 컷의 것이 맨 위에 와요.
- **보내기** — 결과 클립·저장한 프롬프트·지금 컷 버전에서 사람(여러 명)·우리 팀·전사로 보내요. 받은 사람에게 알림이 가고, 같이 보낸 말이 그 프롬프트 대화의 첫 줄이 돼요. 대화에 답하면 서로 알림.

### 공급자 바꾸기 (Higgsfield ↔ fal.ai)

- 관리자 → 모델에서 모델마다 **자동 / Higgsfield / fal.ai**를 고를 수 있어요. 키가 있는 쪽으로만 보내고, 한쪽이 막히면 자동으로 다른 쪽으로 가요.
- Seedance 드래프트는 지금 fal.ai에서만 돼요. Higgsfield API에 드래프트가 생기면 `src/lib/models/registry.ts`의 Seedance `draftProviders`에 `"higgsfield"`를 넣고 요청 주소만 연결하면 돼요 (나머지 흐름 — 드래프트 → 같은 테이크 1080p 완성 — 은 그대로).
- 단가는 관리자 → 모델에서 모델별로 덮어쓸 수 있어 공급자 가격이 바뀌어도 예산 계산을 맞출 수 있어요.

### 디자인

- 다크 전용. 거의 검은 바탕 + 1px 선 + 진한 하늘색(`--accent`) 한 가지 포인트 — 포인트는 "지금·진행" 표시에만 써요.
- 홈: 결과물 영상 한 장면 위에 오늘 날짜와 프롬프트만. 아래에 진행 중인 컷, 최근 OK. (영상은 임시로 `public/media/reel.mp4` — 팀 결과물로 바꾸면 돼요.)
- 로그인: 영상 위에 점(도트 매트릭스)으로 그린 CREATION ZIPUP 로고와 회사 소개, 오른쪽은 유리 패널.
- 프로젝트: 한 줄에 한 프로젝트(컷·테이크·OK, 컷 진행 막대). 컷 보드는 목록 / **타임라인**(첫 테이크 ~ 마지막 테이크 막대, OK 점, 지금 선).
- 사이드바: 메뉴 옆 가는 선이 지금 페이지 쪽으로 휘어 있고, 마우스를 따라 흘러가요.
- 서체는 Pretendard(한글) · Geist(숫자·영문, 큰 숫자는 가늘게) · Geist Mono(라벨) · Geist Pixel(시계). 운영체제의 "동작 줄이기"를 켜면 움직임이 멈춰요.

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

## 배포하기 (Vercel + Supabase)

필요한 곳은 두 군데예요. **Supabase**가 DB와 파일 저장소를, **Vercel**이 사이트를 맡아요.
Cloudflare R2는 선택 사항으로, 파일이 아주 많아져 저장·전송 비용을 줄이고 싶을 때 씁니다.

| 환경 변수 | 값 | 비고 |
|---|---|---|
| `DATABASE_URL` | Supabase **Transaction pooler**(포트 6543) 주소 | 없으면 `POSTGRES_URL` 사용 |
| `DIRECT_DATABASE_URL` | Supabase **Session pooler**(포트 5432) 주소 | 마이그레이션용. 없으면 `POSTGRES_URL_NON_POOLING` → `DATABASE_URL` 순서로 사용 |
| `SUPABASE_URL` | `https://<프로젝트ID>.supabase.co` | 파일 저장소 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role**(또는 `sb_secret_…`) 키 | 서버에서만 쓰는 비밀 키 |
| `BETTER_AUTH_SECRET` | 긴 임의 문자열 (`openssl rand -base64 32`) | 로그인 세션 암호화 |
| `CRON_SECRET` | 긴 임의 문자열 | Vercel Cron 인증 |
| `FAL_KEY`, `HF_CREDENTIALS` | 생성 API 키 | 아래 "API 키" 참고 |

### 방법 A: Vercel에서 Supabase까지 한 번에 (가장 쉬움)
1. [vercel.com](https://vercel.com)에 GitHub 계정으로 가입 → **Add New… → Project** → 이 저장소 **Import**.
2. Environment Variables에 `BETTER_AUTH_SECRET`, `CRON_SECRET`, `FAL_KEY`, `HF_CREDENTIALS`를 넣고 **Deploy**.
   (아직 DB가 없어 첫 화면은 오류가 날 수 있어요. 정상이에요.)
3. 프로젝트 → **Storage → Create Database → Supabase** → 지역 **Seoul (ap-northeast-2)** → 프로젝트에 **Connect**.
   `POSTGRES_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등이 자동으로 들어가요. 앱이 이 이름들을 그대로 읽어요.
4. **Deployments → 맨 위 배포의 ⋯ → Redeploy**. 빌드할 때 DB 테이블이 자동으로 만들어지고, 파일 버킷(`zipup-ai`, 비공개)은 처음 업로드할 때 만들어져요.

### 방법 B: Supabase를 따로 만들어 연결
1. [supabase.com](https://supabase.com)에서 새 프로젝트를 **Seoul (ap-northeast-2)** 리전에 만듭니다.
2. 상단 **Connect** 버튼 → Connection string에서 두 주소를 복사해 `[YOUR-PASSWORD]`를 DB 비밀번호로 바꿉니다.
   - **Transaction pooler (6543)** → `DATABASE_URL`
   - **Session pooler (5432)** → `DIRECT_DATABASE_URL`
3. Project Settings → **API Keys**에서 service_role(또는 secret) 키 → `SUPABASE_SERVICE_ROLE_KEY`, 프로젝트 주소 → `SUPABASE_URL`
4. Vercel에서 저장소를 Import하고 위 표의 환경 변수를 모두 넣은 뒤 Deploy.

직접 마이그레이션하고 싶으면 `DIRECT_DATABASE_URL="postgresql://..." pnpm db:migrate`.
스키마를 바꾼 뒤에는 `pnpm db:generate`로 마이그레이션 파일을 만들어 커밋하면 다음 배포 때 적용돼요.

### 파일 저장소
Higgsfield·fal 결과 URL은 며칠 뒤 만료되므로, 완성된 파일은 바로 저장소로 복사해 영구 보관합니다.
- **Supabase Storage (기본)**: `SUPABASE_URL`과 키만 있으면 자동으로 써요. 비공개 버킷과 서명된 URL을 씁니다.
  무료 플랜은 저장 1GB, 파일당 50MB 제한이 있어요. 사내에서 본격적으로 쓰면 Pro 플랜(저장 100GB)을 권장해요.
- **Cloudflare R2 (선택)**: `S3_*` 값을 넣으면 R2가 우선이에요. 저장 비용이 싸고 전송비가 없어요.
  1. R2 → 버킷 만들기 (예: `zipup-ai`, 비공개)
  2. Manage R2 API Tokens → **Object Read & Write** 토큰 → `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
  3. `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_BUCKET=zipup-ai`
  4. 버킷 → Settings → **CORS 정책** (브라우저에서 바로 업로드·ZIP 다운로드)
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
  이미 Supabase에 쌓인 파일은 자동으로 옮겨지지 않으니, R2로 갈 계획이면 처음부터 R2로 시작하세요.

### API 키
- **Higgsfield**: https://console.higgsfield.ai 에서 API 키 발급 → `HF_CREDENTIALS=KEY_ID:KEY_SECRET`
- **fal.ai**: https://fal.ai/dashboard/keys → `FAL_KEY` (잔액 충전 필요)

### Vercel 설정 참고
- **자동 배포**: 운영 브랜치에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 Vercel로 배포해요. Vercel의 GitHub 연동 없이 토큰으로 배포하므로 GitHub·Vercel 계정이 달라도 돼요.
  저장소 **Settings → Secrets and variables → Actions**에 `VERCEL_TOKEN`(Vercel → Account Settings → Tokens에서 발급)만 넣으면 돼요. 없으면 배포 단계를 건너뛰어요.
- `APP_URL`은 비워 두면 Vercel 운영 주소(`https://<프로젝트>.vercel.app`)를 자동으로 써요. 회사 도메인을 연결했다면 그 주소를 넣으세요. 공급자 **웹훅**이 이 주소로 결과를 알려줘요.
- `vercel.json`에 서울 리전(`icn1`)과 **복구용 Cron**(`/api/cron/tick`, 하루 1번 · 새벽 3시)이 설정돼 있어요. 대기열 제출·상태 확인·결과 저장 재시도는 평소에 **웹훅과 누군가 열어 둔 화면의 폴링**이 처리하고, Cron은 아무도 접속하지 않을 때의 안전망이에요.
  - 이 설정은 Hobby·Pro 어느 플랜에서도 배포돼요. 사내 서비스는 Vercel 약관상 **Pro 플랜**이 맞고, Pro라면 `schedule`을 `* * * * *`(매분)로 바꿔 복구를 더 촘촘하게 할 수 있어요.
- 배포 후 사이트에 **가장 먼저 가입**한 사람이 최고관리자가 됩니다(`ADMIN_EMAILS`에 이메일을 넣으면 그 사람이 관리자). 관리자 → 설정에서 **허용 이메일 도메인**을 지정하는 걸 권장해요.

### 배포 후 첫 설정 체크리스트
- [ ] 관리자 → 팀·예산: 팀별 월 한도 입력
- [ ] 관리자 → 설정: 허용 도메인, 파일명 규칙, 예산 경고 기준, 동시 실행 한도(Higgsfield 플랜에 맞게)
- [ ] 관리자 → 모델·가격: 쓰지 않을 모델 끄기, 공지 입력
- [ ] 관리자 → 개요: 공급자 두 곳이 "연결됨"인지 확인

---

## 알아두면 좋은 점

- **Seedance 2.5 드래프트 모드 (2026-09-22 공식 출시)**: 드래프트를 켜면 480p로 빠르고 싸게 뽑히고 `draft_id`가 발급돼요. 마음에 드는 테이크에서 **"1080p 완성"** 을 누르면 `bytedance/seedance-2.5/draft/complete`로 **같은 프롬프트·레퍼런스·시드 그대로** 1080p가 렌더돼요. 드래프트는 만든 계정에서 **7일 안에** 완성해야 해요.
  - 비용 예시(5초, 16:9): 드래프트 480p 약 $1.03 → 1080p 완성 약 $5.69. 20번 뽑아 1개만 완성하면 1080p로 20번 뽑는 것보다 최대 77% 저렴해요.
  - 이 공식 흐름은 fal.ai에서 지원해요(Higgsfield API 문서에는 아직 드래프트가 없어요). 그래서 드래프트 요청은 항상 fal.ai로 보내요.
  - 드래프트 ID가 없는 경우(예: 다른 공급자로 만든 드래프트)에는 "같은 설정으로 새로 생성(720p/1080p)"만 할 수 있고, 이때는 다른 테이크가 나와요.
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
| `project:신제품`, `team:기획팀`, `cut:C003` | 프로젝트 / 팀 / 컷 |
| `is:ok` `is:keep` `is:ng` | OK / KEEP / NG |
| `is:video` `is:fav` `is:unrated` | 영상 / 즐겨찾기 / 별점 없음 |
| `★4`, `rating>=4` | 별점 4점 이상 |
| `color:red` | 컬러 라벨 |
| `date:week`, `after:2026-09-01`, `before:2026-09-30` | 기간 (한국 시간) |
| `ratio:9:16` | 비율 |

### 단축키

| 키 | 동작 |
| --- | --- |
| `⌘K` / `Ctrl+K`, `/` | 통합 검색·이동 |
| `⌘↵` | 스튜디오에서 생성 |
| `⌘S` | 프롬프트를 새 버전으로 저장 |
| 한국어 대조에서 구간 클릭 → `1`–`6` | 추천 표현을 영어 프롬프트에 적용 |
| `1`–`5`, `0` | 별점 / 별점 지우기 |
| `P` / `K` / `X` / `U` | OK / KEEP / NG / 판정 지우기 |
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
    models/registry.ts 모델 정의 (파라미터, 공급자별 요청 생성, 비용 계산)
    providers/         Higgsfield · fal.ai · mock 공급자
    llm/               번역·추천용 LLM (fal.ai · OpenAI 호환 · 모의)
    prompt/            단어 단위 diff · 언어 감지 · 번역 구간 정렬
    services/          생성 대기열, 예산, 검색, 권한, 관리자 로직
    search/            검색 문법 파서 · 동의어
    storage/           Supabase Storage · R2(S3) · 로컬 저장소
drizzle/               DB 마이그레이션
```

생성 흐름: `POST /api/generations` → 예산 확인(트랜잭션 + advisory lock) → 사내 대기열(`pending`) → 공급자별 동시 실행 한도 안에서 제출 → 웹훅·폴링(·복구 Cron)으로 상태 확인 → 결과를 저장소(Supabase/R2)로 복사하고 썸네일·파일명·검색 인덱스 생성 → 알림.
