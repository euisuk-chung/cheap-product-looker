# 화장품 최저가 기록장

쿠팡과 올리브영의 공개 상품 페이지에서 일반 구매자가 실제로 지불하는 상품가와 필수 배송비를 매일 기록하고 비교하는 로컬 우선 대시보드입니다.

전체 구성과 데이터 흐름은 [ARCHITECTURE.md](ARCHITECTURE.md)를 참고하세요.

- 공개 화면: GitHub Pages 읽기 전용 SPA
- 관리 화면: 로컬 `#/admin`
- 데이터: JSON 상품·후보, append-only JSONL 가격·실행 이력, 관리·조회용 CSV
- 수집: 매일 오전 9시(Asia/Seoul) Codex 스케줄 + 판매처별 서브에이전트 2개 + 매 실행 프로모션 검색 하네스
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

## 자동 추적 흐름

1. 로컬 상품 관리 화면에서 브랜드, 상품명, 용량, 색상·구성을 등록합니다.
2. 다음 Codex 수집 작업에서 쿠팡과 올리브영 조사 에이전트가 공식 페이지 후보를 모두 찾습니다.
3. 리뷰 에이전트가 동일 제품, 구성, 배송비, 재고와 단위가 계산을 독립 검증합니다.
4. 검증을 통과한 판매처별 최저 단가 URL을 코디네이터가 자동 매핑하고 가격 이력에 기록합니다.
5. 공개 Pages는 전체 판매처 중 현재 최저 단가 구매 링크와 가격 변동 이력을 보여 줍니다.
6. 검증할 수 없는 후보는 공개 최저가에 반영하지 않고 추적 현황에 실패 이유를 남깁니다.

가격과 후보 파일을 직접 수정할 때도 반드시 `npm run data:validate`를 통과해야 합니다. 자동 수집의 상세 규칙은 [collector-contract.md](docs/collector-contract.md)를 따릅니다.

## Codex 서브에이전트 공유

프로젝트 전용 에이전트 설정은 `.codex/agents/`에 저장합니다.

- `coupang_price_tracker`: 쿠팡 승인 URL 관측 및 복수 후보 검색
- `oliveyoung_price_tracker`: 올리브영 승인 URL 관측 및 복수 후보 검색
- `price_candidate_reviewer`: 두 조사 결과를 독립 검증하고 자동 반영 가능한 후보만 통과

세 파일은 가격·상품·URL을 고정하지 않고 실행 시점의 `products.json`과 검색 하네스를 읽습니다. 저장소를 clone한 Codex 클라이언트는 프로젝트 범위의 `.codex/config.toml`과 에이전트 파일을 로드합니다. 코디네이터는 두 조사 에이전트를 병렬 실행한 뒤 리뷰 에이전트를 실행하고, 통과한 판매처별 최저 단가 후보만 기록·반영합니다.

## CSV 관리

- `web/public/data/products.csv`: 상품 목록 관리용입니다. 기존 행의 상품 정보를 수정하거나 ID가 빈 행을 추가한 뒤 로컬 관리 화면에서 가져올 수 있습니다. 판매처 URL 열은 확인용이며 가져오기에서 승인 매핑을 변경하지 않습니다.
- `web/public/data/latest-prices.csv`: 활성 상품의 판매처별 최신 가격, 배송비, 총액, 총용량, 단위 가격, 재고, 신선도와 최저가 여부를 자동 생성합니다.

명령으로 상품 CSV를 가져오려면 다음을 실행합니다.

```bash
cd web
npm run data:products:import -- public/data/products.csv
```

CSV에서 누락된 기존 상품은 삭제하지 않고 보존합니다. 신규 행은 조사 대기 상태로 생성되며, 두 판매처에서 검증된 매핑이 만들어지면 자동으로 활성화됩니다.

## 배포

`main`의 `web` 변경이 push되면 GitHub Actions가 실제 데이터 검증과 Vite 빌드를 실행한 후 Pages에 배포합니다. 저장소 프로젝트 경로에 맞춰 Vite base는 `/cheap-product-looker/`입니다.
