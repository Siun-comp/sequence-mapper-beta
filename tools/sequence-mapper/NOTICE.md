# Sequence Mapper — 소스와 라이선스

Sequence Mapper는 JSU LabTools의 도구이며 GPL-2.0-or-later로 배포합니다(`LICENSE.txt`).

## 포함한 외부 구성 요소

| 구성 요소 | 버전 | 라이선스 | 위치 |
|---|---|---|---|
| minimap2 | 2.31 | MIT | `engine/mm2.wasm`, `engine/source/MINIMAP2-LICENSE.txt` |
| SIMDe | 0.8.2 | MIT | `engine/mm2.wasm`에 컴파일 포함, `engine/source/SIMDE-LICENSE.txt` |

## 엔진 빌드 재현

- minimap2 소스: `https://github.com/lh3/minimap2/archive/refs/tags/v2.31.tar.gz` (SHA-256 `bff334a0e4512644e2f3e29944aeec408f49450f4f74dc39fe89e5273869255b`)
- SIMDe 소스: `https://github.com/simd-everywhere/simde/archive/refs/tags/v0.8.2.tar.gz` (SHA-256 `ed2a3268658f2f2a9b5367628a85ccd4cf9516460ed8604eed369653d49b25fb`)
- 컴파일러: Zig 0.14.1, 대상 `wasm32-wasi`, reactor, `-msimd128`
- 추가 코드: `engine/source/wrapper.c`, `engine/source/kthread_stub.c`, `engine/source/compat/zlib.h`, 빌드 명령 `engine/source/build.sh`
- 결과 해시: `mm2.wasm` SHA-256 `437f2b93b2f0f2dfaa5eb7482b269f5f2146db8b44497b4f28e7c0a619344fd1`

minimap2 원본 코드는 수정하지 않았습니다. 스레드와 파일 입출력만 대체했습니다.

## 데이터 처리

서열은 브라우저 메모리에서만 처리합니다. 서버 전송, 외부 계산 호출, 자동 저장은 없습니다.
