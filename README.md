# 공생의 알고리즘 AI

NCPMS 병해충 관측자료, 천적 문헌 근거, 현장 조건 및 사용자 입력 비용을 분리하여 검토하는 농업 의사결정 지원 프로토타입입니다.

서비스: https://app.gongsaeng-ai.com

이 저장소는 기존 Streamlit 프로젝트에 현재 운영 중인 Next.js 프런트엔드와 FastAPI 백엔드를 추가한 것입니다. GitHub 업로드 자체가 운영 서버를 재시작하거나 Cloudflare Tunnel 배포를 변경하지는 않습니다.

## 주요 기능과 해석 원칙

- NCPMS 2024·2025·2026 관측자료 기반 상대 위험도, 조사회차별 그래프, 지역·연도 비교. 관측값 0과 자료 부재를 구분합니다.
- 천적 추천, 문헌 링크, 근거 등급 및 동일 작물·병해충·재배환경의 직접근거 여부를 구분합니다. PubMed 문헌이 있어도 직접근거와 경제성이 확보되었다는 뜻은 아닙니다.
- 스마트팜 사례와 기상 관측은 별도 참고자료입니다. NCPMS 위험도를 임의 가산하거나 다른 농가의 수익을 사용자 농가의 수익으로 간주하지 않습니다.
- 사용자가 입력한 현장 조건·비용과 검증된 근거로 경제성 및 도입 가능성을 검토합니다. 필수자료가 없으면 최종 판정은 '자료 부족'으로 유지합니다.
- 지역 CSV, 스마트팜, 기상자료 요청은 제한시간 후 실패·자료 없음·다시 시도 상태를 표시하며 가짜 관측값을 만들지 않습니다.
- 2027 전망은 과거 자료 기반 연구용 추정으로 미래의 실제 발생량·확률이나 기상을 확정하지 않습니다.

본 서비스는 확정 진단 또는 자동 방제 명령을 제공하는 시스템이 아닙니다. 농약 등록사항, 천적 방사 조건 및 현장 안전은 공식 지침과 전문가 확인이 필요합니다. FuriosaAI·Bricksum 연동을 구현된 기능으로 제공하지 않습니다.

## 구조

```text
frontend/          Next.js App Router, React, TypeScript
backend/           FastAPI, 분석 모듈, unittest 회귀 테스트
data/              실행에 필요한 검토된 공개자료·가공 스냅샷
legacy/streamlit/  기존 원격 저장소의 app.py, 의존성, XLSX, 원래 README 보존본
app.py             기존 Streamlit 진입점 (호환을 위해 보존)
requirements.txt   기존 Streamlit 의존성 (최신 API 의존성과 별개)
```

데이터 목록과 크기·해시는 `data/UPLOAD_MANIFEST.json`을 참고하십시오. 원시 기상자료 전체, 수집 로그, 인증파일, 운영 캐시는 포함하지 않습니다. 데이터 스냅샷의 수집 당시 상태와 현재 실시간 수집 상태는 다를 수 있습니다.

## 실행 환경

검증 환경은 Windows, Node.js 24.19.0, Python 3.13.12입니다. 프런트엔드 잠금파일 기준 Next.js 16.3.0, TypeScript 5.9.3을 사용합니다. 다른 버전 조합은 별도 검증하지 않았습니다. `npm ci`로 잠금파일을 사용하십시오.

### 백엔드

저장소 루트에서 다음 명령을 실행합니다. Python 3.13 및 uv가 설치되어 있어야 합니다.

```powershell
cd backend
uv venv --python 3.13
.\.venv\Scripts\Activate.ps1
uv pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

최신 API 의존성은 반드시 `backend/requirements.txt`를 사용합니다. 루트의 `requirements.txt`는 과거 Streamlit용입니다. `/api/health`로 상태를 확인할 수 있습니다.

### 프런트엔드

다른 터미널에서 저장소 루트 기준으로 실행합니다.

```powershell
cd frontend
npm ci
npm run dev
```

프로덕션 실행:

```powershell
cd frontend
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

프런트엔드는 기본적으로 `http://127.0.0.1:8000`의 백엔드로 `/api` 요청을 전달합니다. 운영 중인 `.next`를 덮어써 빌드하지 말고, 별도 검증본에서 빌드한 후 운영 절차에 따라 전환하십시오. Cloudflare Tunnel 인증정보는 저장소에 포함하지 않습니다.

## 환경변수

`.env.example`은 실제 코드가 읽는 이름만 빈 값으로 제공합니다. 루트의 예제 파일이 자동으로 모든 프로세스에 로드되는 것은 아닙니다. Next.js용 값은 필요할 때 `frontend/.env.local` 또는 프로세스 환경에 설정하고, Python용 값은 백엔드 프로세스 환경에 설정하십시오. 기본값을 사용할 때는 URL 변수를 빈 문자열로 설정하지 말고 생략하십시오.

| 이름 | 사용처 |
| --- | --- |
| `BACKEND_API_URL` | Next.js 서버 프록시·초기 데이터. 기본 `http://127.0.0.1:8000` |
| `INTERNAL_FRONTEND_URL` | 서버 내부 부트스트랩. 기본 `http://127.0.0.1:3000` |
| `CORS_ALLOWED_ORIGINS` | FastAPI 추가 허용 출처, 쉼표 구분 |
| `DATA_GO_KR_KEY` | 포함된 NCPMS 수집 스크립트 및 공공데이터 키 설정 상태 확인 |
| `NONGSARO_API_KEY`, `Nongsaro` | 농사로 키 설정 상태 확인용 별칭 |
| `PSIS_API_KEY` | 농약 API 키 설정 상태 확인 |
| `NEXT_PUBLIC_API_URL` | 보존된 과거 페이지 백업에서만 사용; 현재 페이지 설정 아님 |

포함된 스냅샷으로 기본 앱을 실행하는 데 수집용 API 키는 필요하지 않습니다. 키가 설정되었다는 표시만으로 실시간 API 연동이 완료된 것은 아닙니다. 실제 키, 토큰, 비밀번호 및 개인키는 커밋하지 마십시오.

## 빌드와 회귀 테스트

프런트엔드 디렉터리:

```powershell
npx tsc --noEmit
npm run build
node --test tests/adoption-ui.test.cjs tests/bounded-fetch.test.cjs
```

백엔드 가상환경을 활성화한 뒤 저장소 루트:

```powershell
python -m unittest backend.test_api backend.test_adoption_review
```

백엔드 테스트는 포함 데이터의 위험도·연도 비교·지역 비교·천적 추천·근거·경제성·자료부족 판정 등을 확인합니다. 프런트엔드 테스트는 그래프의 서버 렌더링, 빈 자료, 판정 표시, 요청 시간초과와 재시도를 확인합니다. 자동 테스트 통과가 모든 브라우저·통신환경에서의 동작을 보증하지는 않습니다.

## 데이터 출처와 한계

- 농촌진흥청 NCPMS 예찰자료 및 천적·병해충 공개자료.
- 기상청 ASOS·AWS·해양 관측자료의 가공 결과와 수집 당시 검증 요약.
- 농촌진흥청 농약안전정보 및 농작업안전 공개자료.
- 공공 스마트팜 사례, KOSIS 지역 통계, SGIS 경계 및 KOSHA 공개 재해통계.
- 천적 시험·효과 문헌과 PubMed 등 원문 연결정보. 각 자료 내 출처·원천파일 필드를 함께 확인해야 합니다.

공개자료라는 이유만으로 모든 재사용 조건이 동일하지는 않습니다. 재배포·상업적 활용 시 원 제공기관의 이용조건과 출처표시를 별도로 확인하십시오. 포함 스냅샷은 앱 구동용으로 선별했으며 원천자료 전체나 지속 수집기를 대체하지 않습니다. 지역·작물·기간별 결측, 부분연도, 관측지점 편향, 문헌의 해외·간접근거 한계가 있습니다. 직접근거가 없는 경우 결과를 확정하거나 수치를 보간해 보장하지 않습니다.
