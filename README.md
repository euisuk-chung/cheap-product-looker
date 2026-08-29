# 화장품 최저가 기록장

쿠팡과 올리브영의 공개 상품 페이지에서 일반 구매자가 실제로 지불하는 상품가와 필수 배송비를 매일 기록하고 비교하는 로컬 우선 대시보드입니다.

- 공개 화면: GitHub Pages 읽기 전용 SPA
- 관리 화면: 로컬 `#/admin`
- 데이터: JSON 상품·후보, append-only JSONL 가격·실행 이력
- 수집: 매일 오전 9시(Asia/Seoul) Codex 스케줄 + 판매처별 서브에이전트 2개
- 원칙: 운영과 테스트 모두 Mock·fixture·하드코딩 가격을 사용하지 않음

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```bash
cd web
npm install
npm run dev
```

`http://127.0.0.1:5173/`에서 대시보드를 열 수 있습니다. 개발 명령은 같은 프로세스에서 `127.0.0.1:4174`의 로컬 관리 API도 실행합니다.

## 검증

```bash
cd web
npm run data:validate
npm run lint
npm run build
```

검증은 저장소에 들어 있는 실제 조사 데이터만 사용합니다. 외부 판매처 확인이 필요한 수집 검증은 네트워크나 사이트 상태에 따라 실패할 수 있으며, 실패를 가짜 성공 데이터로 대체하지 않습니다.

## 상품 승인 흐름

1. 로컬 상품 관리 화면에서 브랜드, 상품명, 용량, 색상·구성을 등록합니다.
2. 다음 Codex 수집 작업에서 쿠팡과 올리브영 서브에이전트가 공식 페이지 후보를 찾습니다.
3. 로컬 화면에서 두 후보를 각각 검토하고 승인합니다.
4. 두 판매처가 모두 승인된 상품만 활성화되어 다음 수집부터 가격 이력이 쌓입니다.

가격과 후보 파일을 직접 수정할 때도 반드시 `npm run data:validate`를 통과해야 합니다. 자동 수집의 상세 규칙은 [collector-contract.md](docs/collector-contract.md)를 따릅니다.

## 배포

`main`의 `web` 변경이 push되면 GitHub Actions가 실제 데이터 검증과 Vite 빌드를 실행한 후 Pages에 배포합니다. 저장소 프로젝트 경로에 맞춰 Vite base는 `/cheap-product-looker/`입니다.
