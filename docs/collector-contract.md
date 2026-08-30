# Codex 가격 수집 계약

이 문서는 매일 실행되는 Codex 코디네이터와 판매처 서브에이전트가 지켜야 하는 데이터 계약이다.

## 조사 원칙

- 한 번의 실행에서 정확히 두 서브에이전트를 병렬로 사용한다: `coupang`, `oliveyoung`.
- 서브에이전트는 조사만 하고 파일을 수정하지 않는다. 코디네이터만 검증·병합·커밋한다.
- 가격, 배송비, 재고, 판매자, 후보 URL은 실행 시점의 공식 상품 페이지에서 확인한다. Mock, fixture, 예시 가격, 이전 가격 복사는 금지한다.
- 로그인, CAPTCHA, 접근 차단을 우회하지 않는다. 확인할 수 없는 값은 추정하지 않고 실패 또는 `null`로 남긴다.
- 활성 상품은 승인된 URL을 관측하는 동시에 `product.tracker.searchQueries`로 판매처의 최신 기획·묶음 URL을 매번 다시 검색한다.
- 새 URL은 `requiredTerms`를 모두 만족하고 `excludedTerms`를 포함하지 않을 때만 후보로 저장한다. 승인 매핑을 자동 교체하지 않는다.
- 같은 제품·같은 제형이면 판매 수량과 총용량이 달라도 후보가 될 수 있다. 각 구성의 실제 총용량을 기록해 단위 가격으로 비교한다.

## 가격 판정

- `productPrice`에는 일반 비회원에게 공개된 상품가를 기록한다.
- `shippingFee`에는 모든 일반 구매자에게 필수인 배송비를 기록한다. 금액을 확정하지 못하면 `null`이다.
- 카드, 쿠폰, 와우, CJ ONE 등 조건부 혜택은 `benefitNote`에만 기록한다.
- 배송비가 `null`이면 `totalPrice: null`, `comparable: false`다.
- `totalQuantity`는 판매되는 본품과 같은 제품의 증정분을 포함한 실제 총용량이며, `quantityUnit`은 상품의 `comparisonUnit`과 같아야 한다.
- `unitPrice = totalPrice / totalQuantity`다. 총액이 없으면 `unitPrice`도 `null`이다.
- 재고가 `in_stock`이 아니면 `comparable: false`다.
- 관측 URL·총용량·단위가 승인 매핑과 다르면 관측값을 만들지 않고 새 후보 또는 실행 오류로 남긴다.

## 프로모션·URL 변경 대응

- `discoveryPolicy: every_run` 상품은 승인 URL의 성공 여부와 관계없이 매 실행에서 최신 판매 페이지를 검색한다.
- 승인 URL이 종료·품절·리디렉션되면 해당 판매처 결과를 실패 또는 재매핑 필요로 기록하고 검색 결과를 `replacement` 후보로 추가한다.
- 새 기획·묶음이 발견되면 `promotion` 후보로 추가한다. 이미 존재하는 동일 URL 후보는 갱신하되 승인 상태는 보존한다.
- 후보에는 `totalQuantity`, `quantityUnit`, `candidateKind`, 교체 대상이 있으면 `replacesUrl`을 기록한다.
- 공개 Pages에서는 후보와 원본 URL을 읽기 전용으로 검토할 수 있다. 승인·거절은 로컬 관리 서버에서만 수행한다.

## 저장과 배포

- 결과는 `src/lib/schema.ts`의 `collectorPayloadSchema`를 통과해야 한다.
- 임시 payload를 `web/.collector-result.json`에 만든 뒤 `npm run data:import -- .collector-result.json`으로 가져온다.
- 가져오기 후 `npm run data:rebuild`가 `products.csv`와 `latest-prices.csv`를 실제 저장 데이터에서 다시 생성한다. CSV에 가격을 직접 작성하지 않는다.
- `npm run lint`와 `npm run build`가 모두 성공한 경우에만 공개 데이터 파일을 커밋한다.
- 커밋 대상은 `web/public/data/*.json`, `web/public/data/*.jsonl`, 자동 생성된 `web/public/data/*.csv`뿐이다.
- 커밋 메시지는 `data: refresh prices YYYY-MM-DD` 형식이다. `main`에 일반 push만 사용하고 force push는 금지한다.
- 원격 `main`이 앞서 있거나 push가 거절되면 로컬 데이터를 보존하고 실행 결과에 배포 실패를 보고한다.
