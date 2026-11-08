# 소스·라이선스와 실행 범위

## 현재 Phase 2 로컬 검토 후보 — 2026-10-27

UI0.1.2-dev.1 / 엔진0.1.0-dev.1 / 기존 기본계약0.4 + analysis-suite/1. Phase1 후보를 기준으로 기본/말단/온도 작업탭, A5′/B3′·A3′/B5′ 독립fragment 비교, 최대21점의 수동 온도 격자와 선택적 전체 A/B hairpin, 같은3슬롯 보관·출처/좌표/온도를 보존한 출력을 추가한다. 아직 커밋·공개배포하지 않았다. 아래 Phase1과 이전 게시 이력은 보존한다.

새 suite-core/engine/worker/report/view 코드도 GPL-2.0-or-later다. NN/Mg 수식·C/WASM/파라미터/엔진 manifest·조건 파서·기본 Worker는 변경하지 않았다. fragment마다 init/symmetry/농도를 다시 평가하며 짧은 구간은 탐색적 근사다. 실제말단풀림/접근성/확률/속도/Beacon/mismatch를 계산하지 않는다. Mg 실제Tm과 Mg0참고의 경계를 유지한다. 새 suite-export/1은 기존CSV48/49열뒤에14개 출처필드를 추가하며 구조복사/원문/원문opt-in/수식방지를 재사용한다.


## 현재 Phase 1 로컬 검토 후보 — 2026-10-27

UI0.1.1-dev.1 / 엔진0.1.0-dev.1 / 계약0.4. 기존 정식 공개 버전0.1.0-beta.1을 기준으로 사용흐름·선택/결과 배치·THAL 구조 표기/복사·해석 안내를 보완한 로컬 후보다. 아래 공개/개발 이력은 당시 버전 그대로 보존한다. 이번 후보는 아직 커밋·공개 배포하지 않았다.

새 표시 코드 structure.mjs와 clipboard.mjs도 GPL-2.0-or-later다. dot-bracket과 염기쌍 좌표는 고정 THAL 반환 구조의 검증된 표기 변환이며 MFE/확률/새 에너지 계산이 아니다. C/파라미터/WASM/엔진 manifest·NN/Mg 수식·조건 파서·Worker는 변경하지 않는다. 텍스트·HTML 복사와 CSV 뒤쪽의 파생 구조4열을 추가하고 기존 열 순서·원문을 유지한다. 수신 앱이 대상 글꼴로 붙여넣으면 원본 서식 유지/HTML 붙여넣기가 필요할 수 있다. 계산 지원 범위·기존 실측 차이는 유지한다.


이 독립 도구의 직접 결합 코드는 GPL-2.0-or-later로 제공한다. 기존 JSU 도구의 라이선스를 변경하지 않는다. GPL 본문은 LICENSE.txt와 engine/source/gpl-2.0.txt에 있다.

- Hairpin: primer3-py 2.3.1의 PyPI sdist `primer3_py-2.3.1.tar.gz`. `thal.c`, `thal.h`, `thal_parameters.c`, `thal_parameters.h`, GPL 본문은 원본 bytes를 보존했다. 저작권자는 각 파일의 고지를 따른다. 실제 소스/파라미터·WASM 해시는 engine/manifest.json을 따른다.
- 새 코드: JSU LabTools 후보 wrapper, WASI 오류 경계, JS loader·NN/선택 UI·요청/결과 계약·Worker·보관/비교·출력. `wrapper.c`는 입력 검증·단위 변환·THL_GENERAL 모드·구조 유무 확인 후 선택적 그리기를 담당한다. 미검출을 수치 0으로 해석하지 않는다.
- WASM 오류 경계: WASI에서 THAL의 longjmp 오류 경로는 trap으로 종료한다. 정상 수치 알고리즘은 변경하지 않는다. 실패 인스턴스를 폐기하며 다음 독립 분석에는 새 인스턴스를 사용한다. Native는 원래 플랫폼 setjmp/longjmp다. 제품은 로컬 Worker에서 고정 해시의 WASM을 실행한다. 취소/시간 초과는 Worker를 종료하고 늦은 응답을 거절한다. 내부 OOM fault injection 및 모든 자원 오류 복구를 검증한 것은 아니다.
- 빌드: Zig 0.14.1. `engine/source/build.py --zig ... --output ...`로 C 소스/내장 파라미터에서 native/WASM을 생성한다. 전역 compiler/Python 설치나 서버가 제품 실행의 의존성은 아니다. 컴파일러는 ziglang.org의 고정판/공식 SHA-256을 확인한 로컬 개발용이다.
- Duplex: SantaLucia & Hicks (2004) 계열 DNA_NN4 공개 수치 항 및 SantaLucia entropy salt correction. Biopython 1.88은 독립 구현 대조용이며 앱에 Python 패키지나 코드를 배포하지 않는다. Mg=0의 별도 고정 완전 상보 에너지 모델과 Mg>0의 Tm 전용 보정 분기를 구분한다. 제한된 실측자료의 평가와 고정 수식 구현 검증을 구분한다.
- 논문·실측 데이터·NUPACK·IDT 서비스/소스/바이너리는 이 앱에 포함하거나 호출하지 않는다. 문헌 대조는 별도의 내부 validation 자료다. 데이터/원문 권리는 각 출처와 별도로 검토하며 코드 MIT 고지만으로 논문/데이터 재배포 권리를 가정하지 않는다.

현재 실행 범위는 선택 UI·조건/온도별 수치 분석·A/B hairpin·최대3개 보관/비교·서열/선택 정보 및 결과 복사/TXT/CSV다. 계산 입력은 일반 ACGT2~60nt·0~100°C이며 실측 정확도 인증 범위가 아니다. 실측 예측 한계는 validation.html에 보존한다. 이 문단은 로컬 개발 당시 기록이다. Mismatch·NUPACK/대체 엔진은 포함하지 않는다. 2026-10-20 착수/2026-10-21 연속 검증 후보이며 실제 검증 범위는 후속 구현 보고서209를 따른다.

선택·서열·수치 조건 변경은 기본 활성인 자동 계산에서 160 ms 입력 대기 후 최신 요청을 실행한다. 이전 결과는 즉시 만료시키고 취소/오류/늦은 응답 처리는 유지한다. 자동 계산을 끄면 지금 계산 버튼으로 실행할 수 있다. 접기·집중 보기·수치별 도움말은 계산 모델과 파라미터를 변경하지 않는다. UI 후보0.1.0-dev.5, 엔진0.1.0-dev.1. 상세 변경·검증은 보고서210을 따른다.

2026-10-21 사용자 지정 기본값 변경:60°C·Na50mM·K/NH₄0mM·Mg total3mM·dNTP total0.8mM·A/B각200nM. 첫 로드/초기화에 적용하며 서열·범위 변경은 편집한 조건을 덮어쓰지 않는다. UI0.1.0-dev.6, 엔진0.1.0-dev.1. Mg 포함 duplex 미지원·가능한 hairpin 제공을 유지한다. 변경·검증은 보고서211을 따른다.

2026-10-21 후보0.1.0-dev.7: 사용자 보완 요청에 Mg>0 duplex Tm을 추가했다. DOI10.1021/bi702363u의 Owczarzy2008 역수 Kelvin 보정·Mg-dNTP 결합 근사를 독립 JS로 구현하고 Biopython1.88 saltcorr7과 대조한다. Python 패키지·외부 서비스는 앱에 반입하지 않는다. Tm/온도차/동일조건 ΔTm만 제공하고 ΔG/H/S·ΔΔG는 미지원이다. Mg=0 수치·기존 Primer3 C/WASM/파라미터/manifest는 유지한다. 요청/응답 계약0.3·변경한 JS 모듈 SHA·부분 결과/복사/CSV를 연결한다. 이전 후보의 Mg 전체 미지원 기록은 당시 이력이며 현재 지원은 이 문단과 보고서212를 따른다.

2026-10-21 후보0.1.0-dev.8: 사용자 요청에 Mg>0에서 Mg=0 참고 duplex G/H/S/Tm을 별도 제공합니다. Mg만0으로 바꾸고 나머지 입력은 유지하며 dNTP 독립 효과는 미반영입니다. 실제 Mg 보정 Tm과 참고값을 섞지 않고 별도 조건/상태/출력 행으로 보존합니다. 단가염0이면 참고값 미지원입니다. 계약0.4이며 기존 NN/Mg Tm 공식·Primer3 C/WASM/manifest는 유지합니다. 상세 검증은 보고서213을 따릅니다.

2026-10-22 공개 초기 베타0.1.0-beta.1: 사용자 현재 상태의 커밋·배포 요청으로 dev.8을 게시한다. 계산식·C/파라미터/WASM은 변경하지 않는다. UI 버전/게시 표기와 공개 빌드 manifest의 재현 경로만 정리하고 요청의 manifest SHA를 갱신했다. 기존 실측 한계와 Mg=0 참고 조건을 유지한다. 이 폴더의 GPL 직접 결합 코드와 engine/source 전체 대응 소스를 함께 제공하며 기존 다른 도구의 라이선스는 바꾸지 않는다. engine/source/build.py가 전체 빌드 플래그를 포함하고 Zig0.14.1은 사용자가 준비하는 일반 개발 도구이다. 검증 fixture와 회귀는 저장소 tests/oligo-thermodynamics에 있으며, 내부 문헌/사용자 자료는 게시하지 않는다.


## Phase3R UI0.1.3-dev.1 (2026-10-28)

New GPL-2.0-or-later modules: pair-workbench-core.mjs, pair-workbench-worker.mjs, pair-workbench-view.mjs and workbench-report.mjs. They connect the previously pinned adapter without changing upstream C, parameters or WASM. Raw API reference concentration remains separate from actual A/B totals. Optional fixed PCR END reference uses the limited retrospective evidence attributed in pcr-reference.mjs and the UI; it is not a probability or a dimer-free cutoff. Original published workbooks and offline reader dependencies are not included in this application. Existing Oligo Analysis bulk screening is separate.


## 현재 Phase4R Conventional Beacon 로컬 후보 — 2026-10-28

UI0.1.4-dev.1 / beacon-workbench/1 / 고정 Primer3 THAL adapter0.1.0-dev.1. Phase3R의50파일을 보존한 별도 후보에5번째 Beacon 탭을 추가한다. 새 beacon-core/structure/input/worker/view/report JS도 GPL-2.0-or-later다. 원본 C/파라미터/WASM/manifest·기존 NN/Mg 모델·의존성은 변경하지 않았다. 위 Phase1~3R 기록은 당시 이력이다.

S5+선택R+S3 조립, 별도 Target 원본/선택, 전체 Beacon/선택 Target hairpin과 독립 R–Target/전체 Beacon–Target ANY의4반응을 구분한다. 지정 stem/반환 pair와 의도 접촉 위치를 대조하고 미실행·미검출에 수치를 만들지 않는다. R–Target은 stem을 제외한 별도 선형 가닥 가정이며 실제 Beacon 반응의 stem 무관성을 뜻하지 않는다. 반환 구조의 위치 서술은 접근 확률이 아니다.

기존 CSV 앞부분은 유지하고 Beacon 포함 출력에만 beacon-export/1의26개 필드 및 원문 opt-in 한 열을 추가한다. Beacon 반응별 차이는 beacon_comparison_json으로 제공하며 기존 duplex 변화량 열에 대입하지 않는다. 두 원문은 기본 제외다. 실제 Mg/표지의 에너지 오차·hairpin 후보 순위·closed 분율/개방 비용/순ΔG/Kd/속도/형광·고정 mismatch/shared-stem 모델은 미확립/미지원이다. 로컬336분석 대조는 모델 재현이며 새 실측n이 아니다. 커밋/공개배포는 하지 않았다.


## 현재 Phase5R 관계·고정 정렬 로컬 후보 — 2026-10-28

UI0.1.5-dev.1 / relationship-workbench/1·relationship-record/1·fixed-alignment/1. 기존5탭은 유지하고 두 독립 원본/선택의 관계 묶음과 고정 정렬을 추가한다. 새 직접 결합 JS는 GPL-2.0-or-later다. 기존 Primer3 C/파라미터/WASM/manifest·NN4·구조/클립보드와 다른 도구의 권리를 변경하지 않았다.

고정 NN은 Biopython1.88 MeltingTemp.py의 DNA_NN3(17항)·DNA_IMM1 중 검증한 ACGT 단일 내부40항을 별도 데이터로 사용한다. 파일 헤더의 BSD3 선택에 따라 원본 저작권/허가 고지와 전체 라이선스·대응 원문을 fixed-source/에 보존한다. 원본에 있는 모든 기능/비ACGT 항을 실행 지원한다는 뜻이 아니다. fixed-nn-params.json의 출처 SHA와 각 mismatch 항의 DOI를 기록하며 NN/IMM는 같은 검증된 공동 자산이다. CSV 두 table SHA는 이 공동 파일의 동일 SHA다.

고정한 PM/MM는 같은 NN3/IMM·Na-only/Mg0·ΔCp=0 참고다. Tm은 각 가닥 동량 C_ref 기준이며 실제 A/B·THAL API와 별도다. A.C/C.A는 원표 pH 연결 미확립으로 제외한다. 단일 내부 위치3~N−2·5~60nt의 지원된 문맥만 계산하며 말단/다중/변형·전체 반응/속도/형광·실제Mg fixed 에너지/평형은 미지원이다. THAL ANY는 별도 반환 정렬이며 고정 mismatch 손실로 대체하지 않는다.

Biopython은 제품 런타임 의존성이 아니다. 원본 Python 계측/시험 데이터는 개발용이며 브라우저가 외부 계산 서버를 호출하지 않는다. 원 논문/실측 데이터는 이 패키지에 복사하지 않았다. 원본 재현·문헌 파라미터 적합 근거와 독립 실측 정확도를 구분한다. 이번 후보는 로컬 검토용이며 커밋/공개배포하지 않았다. 위 Phase1~4R의 기록은 당시 이력이다.
