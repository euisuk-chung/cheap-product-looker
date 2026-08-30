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

## 상품 승인 흐름

1. 로컬 상품 관리 화면에서 브랜드, 상품명, 용량, 색상·구성을 등록합니다.
2. 다음 Codex 수집 작업에서 쿠팡과 올리브영 서브에이전트가 공식 페이지 후보를 찾습니다.
3. 공개 Pages에서 후보 구성과 실제 URL을 읽기 전용으로 검토하고, 로컬 화면에서 승인합니다.
4. 두 판매처가 모두 승인된 상품만 활성화되어 다음 수집부터 배송 포함 `원/g` 또는 `원/ml` 이력이 쌓입니다.
5. 활성 상품도 매일 새 기획·묶음 URL을 검색하며, 변경된 URL은 자동 승인하지 않고 새 후보로 노출합니다.
6. 검색 결과의 첫 상품만 택하지 않고 동일 제품 후보를 모두 모아, 배송 포함 `원/g` 또는 `원/ml` 순으로 정렬해 최저 단가 교체 후보를 추천합니다.

가격과 후보 파일을 직접 수정할 때도 반드시 `npm run data:validate`를 통과해야 합니다. 자동 수집의 상세 규칙은 [collector-contract.md](docs/collector-contract.md)를 따릅니다.

## Codex 서브에이전트 공유

프로젝트 전용 에이전트 설정은 `.codex/agents/`에 저장합니다.

- `coupang_price_tracker`: 쿠팡 승인 URL 관측 및 복수 후보 검색
- `oliveyoung_price_tracker`: 올리브영 승인 URL 관측 및 복수 후보 검색

두 파일은 가격·상품·URL을 고정하지 않고 실행 시점의 `products.json`과 검색 하네스를 읽습니다. 저장소를 clone한 Codex 클라이언트는 프로젝트 범위의 `.codex/config.toml`과 에이전트 파일을 로드하며, 코디네이터는 두 이름을 명시해 병렬 실행해야 합니다.

## CSV 관리

- `web/public/data/products.csv`: 상품 목록 관리용입니다. 기존 행의 상품 정보를 수정하거나 ID가 빈 행을 추가한 뒤 로컬 관리 화면에서 가져올 수 있습니다. 판매처 URL 열은 확인용이며 가져오기에서 승인 매핑을 변경하지 않습니다.
- `web/public/data/latest-prices.csv`: 활성 상품의 판매처별 최신 가격, 배송비, 총액, 총용량, 단위 가격, 재고, 신선도와 최저가 여부를 자동 생성합니다.

명령으로 상품 CSV를 가져오려면 다음을 실행합니다.

```bash
cd web
npm run data:products:import -- public/data/products.csv
```

CSV에서 누락된 기존 상품은 삭제하지 않고 보존합니다. 신규 행은 항상 승인 대기 상태로 생성되며, 후보 승인 없이 활성화할 수 없습니다.

## 배포

`main`의 `web` 변경이 push되면 GitHub Actions가 실제 데이터 검증과 Vite 빌드를 실행한 후 Pages에 배포합니다. 저장소 프로젝트 경로에 맞춰 Vite base는 `/cheap-product-looker/`입니다.
