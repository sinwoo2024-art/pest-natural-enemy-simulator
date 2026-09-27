# 노지 경관관리 트랙 수정·검증 보고

## 범위와 데이터 흐름

현재 운영 원본의 Next.js/FastAPI 코드에 A안(노지 상대위험·패턴 분석 → 천적 보호 경관관리 검토)을 추가했습니다. 전체 페이지·지도·그래프·기존 분석을 재설계하지 않았습니다.

메인 선택 작물·병해충·지역 → `/api/landscape-review` → 기존 서버 `simulate(2026)`의 상대위험·조사회차 패턴 및 천적 근거 조회 → 사용자가 입력한 실제 밀도·경관조건의 독립 판단입니다. 클라이언트가 위험도·공식 효과율·공식 피해기준을 주입할 수 없도록 요청 필드를 제한했습니다.

스마트팜 패널은 `/api/smartfarm/evidence`만 독립 호출합니다. 기존 경제성 컨텍스트와 decision-support 호출 연결을 제거하고, 기존 원형 신호·자료 패널·작기 그래프·출처/승인·음성 설명을 유지했습니다. 중복되던 천적 방사 원문·현장 관문 입력은 원래의 경제성 영역에서 계속 제공합니다. 2015~2024년 238농가·651작기는 작기·시설환경 자료이지 해충 발생밀도 자료가 아닙니다.

## 변경 파일

- `backend/landscape_review.py`: 요청 검증, 밀도·피해기준 구분, 경관 입력, 조건별 검토사항, 출처·등급·상태 및 기후 해석 경계.
- `backend/main.py`: 독립 경관관리 API 추가. 기존 위험도·경제성 계산 함수 유지.
- `backend/smartfarm_evidence.py`: 별도 트랙 표시, 시설 밀도·방사밀도·최적 시점 미산출 경계.
- `backend/test_landscape_review.py`: 추가 도메인/API 회귀 테스트.
- `frontend/app/landscape-review.tsx`, `landscape-review.module.css`: 선택 조건 연동, 7단계 화면, 입력·빈 자료·오류·재시도.
- `frontend/app/page.tsx`: 메인 A안 설명, 탐색 메뉴·경관관리 영역 삽입.
- `frontend/app/smartfarm-release-window.tsx`: 스마트팜 자료와 경제성 상태의 결합 해제.
- `frontend/app/adoption-review.tsx`: 별도 구입·방사 경제성 시나리오 설명. 계산식 변경 없음.
- `frontend/app/hero-decision-signal.tsx`: 참고 신호의 접근성 설명 수정.
- `frontend/app/bounded-fetch.ts`: 기존 제한시간·취소 동작을 유지한 POST 지원.
- `frontend/tests/landscape-ui.test.cjs`, `bounded-fetch.test.cjs`, `adoption-smoke.mjs`: 입력·분리·POST·실제 HTTP 회귀 검증.
- `README.md`: A안·트랙 경계·등급·밀도·피해기준·기후 한계와 테스트 명령 추가.

`/agent-finance`에 해당하는 기존 파일은 현재 frontend/backend에서 발견되지 않았으며 해당 기능을 생성·삭제·변경하지 않았습니다. 기존 운영 원본의 다른 미커밋 변경은 보존했고 이번 GitHub 커밋에는 위 수정만 반영합니다. 기존 GitHub 데이터 스냅샷은 변경하지 않았습니다.

## 입력과 판단

입력: 논·밭·과수원·기타 노지, 가장자리 식생, 꽃자원, 초생대·비경작지·피난처, 수림대·울타리, 주변 토지이용, 최근 예초·제초, 비선택성 살충제 사용, 해충 밀도조사 및 천적 관찰 여부, 실제 밀도·방법·단위·조사일. 선택적 비공식 기준 메모는 사용자 가정값으로만 표시합니다. 미확인과 실제 관측 0을 구분합니다.

상태: `경관조사 우선`, `근거자료 부족`, `보전관리 조건부 검토`, `현장 실증 후보`. 마지막 상태는 직접근거 연결용 판단 분기로만 준비했습니다. 현재 국내 직접 처리·대조 원장이 없어 실제 응답에서 승격시키지 않습니다. 누락된 밀도·방법·단위·일자 또는 경관 미확인은 조사 우선입니다. NCPMS 위험점수의 크기로 이 상태를 올리지 않습니다.

현재 일반 근거 연결은 진딧물과 무당벌레·풀잠자리·꽃등에 기능군으로 제한합니다. 이 연결은 특정 작물·천적 종·국내 환경의 효과 검증이 아니며 C등급입니다. 다른 병해충이나 천적이 없으면 목록을 임의 생성하지 않습니다. 식생·꽃·피난처·예초·약제 이력에 따라 검토사항이 달라집니다.

## 검증한 출처

- USDA NRCS, *Common Beneficial Insects and their Habitat*, 2014: https://www.nrcs.usda.gov/plantmaterials/txpmctn12248.pdf
- Karp et al., *Crop pests and predators exhibit inconsistent responses to surrounding landscape composition*, PNAS, 2018: https://pmc.ncbi.nlm.nih.gov/articles/PMC6099893/ ; DOI `10.1073/pnas.1800042115`.

정부·학술 원문을 확인했지만 국외 일반 지침과 다지역 연구입니다. 기존 천적 방사 A등급을 경관관리 A등급으로 전용하지 않습니다. 꽃자원·비경작 식생이 일부 해충에도 유리할 수 있다는 주의를 함께 표시합니다. 식물종·면적·폭·예초 간격·효과율을 임의 지정하지 않았습니다.

## 미구현 항목과 필요한 자료

- 동일 조건 공식 경제적 피해기준 및 EIL 산출: 공식 기준 원문, 작물·해충·생육단계·조사방법·단위 일치, 비용·작물가치·단위해충당 피해량·방제효율 자료가 필요합니다. 현재 공식 비교·방제 필요 판단·EIL 값은 모두 미산출입니다.
- 국내 직접 처리·대조 경관관리 효과 및 정량 관리규격: 천적 동정, 실제 밀도, 현장 경관조사, 예초·약제 이력과 국내 현장 시험이 필요합니다.
- 시설 해충 예측·방사밀도·최적 방사 시점: 실제 시설 해충 밀도자료가 없으므로 구현하지 않았습니다.
- 기후변화 인과효과: 2024~2026 NCPMS만으로 확정하지 않습니다. 장기 병해충 시계열과 인과분석 설계가 필요합니다. KMA는 기상 배경·장기 기후경향, 양자의 관계는 탐색적 연관성 검토입니다.

## 검증 결과

- 원본 및 GitHub 업로드 검토본 백엔드: `python -m unittest backend.test_landscape_review backend.test_adoption_review backend.test_api` — **69개 통과**.
- 프런트엔드: `node --test tests/adoption-ui.test.cjs tests/bounded-fetch.test.cjs tests/landscape-ui.test.cjs` — **13개 통과**.
- `npx tsc --noEmit` — 통과.
- 업로드 검토본 `npm run build` — 통과. 운영 `.next`는 덮어쓰지 않았습니다.
- 별도 프로덕션 검증 서버(프런트 3012, 백엔드 8012)에서 `node tests/adoption-smoke.mjs http://127.0.0.1:3012` — 통과. 두 번의 HTML 요청에 그래프 SVG·새 트랙 표시, 7개 JS 파일 HTTP 200, 기존 API와 신규 API 확인.
- 190개 목록, NCPMS 위험도·조사회차 그래프·지역 비교·2027 전망·기상 관측·천적 추천·경제성·스마트팜 공식 자료 회귀 유지.
- 소스 비밀정보 및 업로드 후보 검사에서 자동검사상 비밀값 미검출. 기존 비밀파일·환경설정·터널 인증정보·의존성·빌드·캐시·로그는 업로드 제외.
- **실제 브라우저 화면·클릭 검증 미완료**: Browser 스킬 절차로 조회했으나 연결된 브라우저가 없었습니다. HTTP/서버 렌더링 및 자동 테스트를 실제 브라우저 검증으로 간주하지 않습니다. 데스크톱·모바일 레이아웃과 선택/재시도 클릭은 브라우저 연결 후 추가 확인이 필요합니다.

## 배포와 GitHub

업로드 대상은 기존 `sinwoo2024-art/pest-natural-enemy-simulator`의 `main`입니다. 원본 작업 폴더의 다른 remote는 변경하지 않습니다. 검토 복사본에서 이번 변경만 커밋·일반 push합니다.

현재 공개 사이트의 실행 중인 프로세스·Cloudflare Tunnel·운영 빌드는 이번 작업에서 전환하지 않았습니다. GitHub 소스 업데이트와 공개 사이트 배포는 별도이며, 공개 화면에 적용하려면 검증 빌드의 운영 전환이 필요합니다.
