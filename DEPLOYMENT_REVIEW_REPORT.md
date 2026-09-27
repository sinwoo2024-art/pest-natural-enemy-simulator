# 노지 경관관리·경제적 기준 검토 반영 보고

검증일: 2026-09-27. 이전 LANDSCAPE_REVIEW_REPORT.md의 미배포·EIL 미구현 기록을 대체하는 후속 작업입니다.

## 구현

- 기존 녹색·주황색 화면과 NCPMS 분석·그래프·천적 추천·경제성은 유지했습니다.
- 메인에 노지 핵심 트랙, 시설 밀도 추정 금지, 각 자료 분리 및 자동 방사 명령이 아니라는 설명을 명시했습니다.
- 현장 포장명·조사일·면적/주수·실제 밀도·방법·단위·천적 관찰 수·경관·예초·약제 이력을 입력받습니다. 값은 저장하지 않습니다.
- 방식 A는 출처·단위·대상·적용조건을 함께 받으며, 사용자 입력 출처를 공식 검증으로 승격하지 않습니다.
- 방식 B는 C/V/I/D/K 및 호환 단위가 모두 있을 때만 EIL을 계산합니다. 가짜 기본값·단위 환산·방제 명령은 없습니다.
- 경관 미입력은 경관조사 우선, 밀도·방법·단위·비교 가능한 경제적 기준 부족은 근거자료 부족입니다. 일반 근거·서식처·필수 입력이 연결되면 보전관리 조건부 검토입니다. 국내 직접 처리·대조 원장이 없어 현장 실증 후보로 자동 승격하지 않습니다.
- 사용·미사용·부족 자료와 다음 조사 행동을 각각 표시합니다. 기상 관측은 해당 시도 최대 3개 관측소의 별도 참고이며 포장 최근접·동일 위치 관측으로 가장하지 않습니다.
- 스마트팜 확장 연구 트랙은 독립적으로 유지하며 향후 실제 밀도·처리량·처리 전후·수량·비용 검증 필요성을 명시했습니다.

## 수정 파일

- backend/economic_threshold.py (신규): 단위 검증, 사용자 기준 비교, EIL 계산
- backend/landscape_review.py: 입력 모델·판정·결과 설명
- backend/main.py: 기상 관측 별도 응답
- backend/test_economic_threshold.py (신규), backend/test_landscape_review.py
- frontend/app/threshold-inputs.tsx (신규): 두 입력 방식
- frontend/app/landscape-review.tsx, landscape-review.module.css
- frontend/app/page.tsx, smartfarm-release-window.tsx
- frontend/tests/landscape-ui.test.cjs, adoption-smoke.mjs
- README.md 및 이 보고서

## 검증

- FastAPI unittest 75개 통과. 프런트엔드 Node 테스트 14개 통과. TypeScript 검사 통과.
- Next.js 프로덕션 빌드 통과. 격리된 프리뷰(3012/8012)에서 HTTP 연동 통과 후 운영 주소(3000/8000) 설정으로 재빌드했습니다.
- 공개 주소 https://app.gongsaeng-ai.com 에서 adoption-smoke.mjs 검증: 실제 그래프 SVG, 190개 병해충, 지역 비교, 2027 전망, 천적 추천·PubMed 원문, 자료 부족 판정, 스마트팜 분리, 경관조사 우선, EIL 누락·정상·단위 불일치, 새 문구, 7개 스크립트 자산 응답 통과.
- 실제 브라우저 연결은 없어 클릭·화면 배치 검증은 미완료입니다. HTTP/SSR 검증을 브라우저 검증으로 간주하지 않습니다.
- 소스 비밀정보 검사 163개 파일, 배포 후보 검사 202개 파일, Git 기록의 텍스트 blob 183개 검사에서 후보 0건. staging 금지 경로·데이터 해시 불일치·값이 들어간 환경변수 예시도 0건입니다. 자동 패턴 검사의 한계는 있습니다.

## 배포

운영 소스는 Downloads/symbiosis-ai-prototype (2)/prototype입니다. 운영 데이터와 의존성은 그대로 유지하고 백엔드와 Next.js 프로덕션 서버만 재시작했습니다. Cloudflare Tunnel·토큰·DNS·포트를 변경하지 않았습니다. 전환 중 일시적 502 후 공개 주소 검증이 통과했습니다.

이전 프런트엔드 빌드는 로컬 frontend/.next_pre_fast_backup_20260927_191111에 보존했습니다. 삭제하지 않았으며 업로드하지 않습니다. 실행 로그와 배포 보조 스크립트는 로컬 tmp에만 있습니다.

업로드 대상은 기존 pest-natural-enemy-simulator 저장소의 main입니다. 운영 작업 폴더의 다른 remote를 바꾸지 않고 tmp/github-release의 검토된 변경만 반영합니다. 운영 환경·키·node_modules·.next·.venv·로그·백업은 GitHub 대상이 아닙니다.

## 남은 한계

공식 경제적 기준 원문 자동 검증, 국내 동일 작물·환경의 경관관리 직접효과, 방사량·최적 날짜·효과율은 제공하지 않습니다. EIL은 사용자 입력 시나리오이고 지원 단위 밖은 계산하지 않습니다. 2024~2026 NCPMS만으로 장기 기후변화 인과를 확정하지 않습니다. 로컬 컴퓨터와 앱·터널 프로세스가 계속 실행되어야 공개 서비스가 유지됩니다.
