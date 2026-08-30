# Codex 가격 수집 계약

이 문서는 매일 실행되는 Codex 코디네이터와 판매처 서브에이전트가 지켜야 하는 데이터 계약이다.

## 조사 원칙

- 한 번의 실행에서 `coupang_price_tracker`와 `oliveyoung_price_tracker`를 병렬 실행한 뒤 `price_candidate_reviewer`를 순차 실행한다.
- 서브에이전트는 조사·리뷰만 하고 파일을 수정하지 않는다. 코디네이터만 검증·병합·커밋한다.
- 가격, 배송비, 재고, 판매자, 후보 URL과 대표 이미지는 실행 시점의 공식 상품 페이지에서 확인한다. Mock, fixture, 예시 가격, 이전 가격 복사는 금지한다.
- 로그인, CAPTCHA, 접근 차단을 우회하지 않는다. 확인할 수 없는 값은 추정하지 않고 실패 또는 `null`로 남긴다.
- 활성 상품은 승인된 URL을 관측하는 동시에 `product.tracker.searchQueries`로 판매처의 최신 기획·묶음 URL을 매번 다시 검색한다.
- 새 URL은 `requiredTerms`를 모두 만족하고 `excludedTerms`를 포함하지 않을 때만 후보로 저장한다. 리뷰 에이전트가 통과시킨 판매처별 최저 단가 후보만 자동 매핑한다.
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

## 리뷰와 자동 반영

- 조사 에이전트의 결과는 리뷰 전에는 `reviewStatus: pending`이다.
- 리뷰 에이전트는 공식 호스트, 동일 제품, 구성·총용량, 일반가, 필수 배송비, 재고와 단위가 계산을 독립적으로 확인한다.
- 검증을 통과한 후보는 `reviewStatus: passed`, 실패한 후보는 `failed`로 기록하며 구체적인 이유와 시각을 남긴다.
- 각 상품·판매처에서 이번 실행에 통과하고 비교 가능한 후보 중 배송 포함 단위가가 가장 낮은 URL을 현재 추적 매핑으로 자동 채택한다.
- 코디네이터는 선택된 URL의 관측값만 가격 이력에 추가한다. 리뷰 결과가 없거나 실패한 값은 기록·공개 최저가에 반영하지 않는다.
- 후보와 관측의 `imageUrl`에는 해당 판매 구성의 대표 상품 이미지만 기록한다. 리뷰 에이전트는 `verifiedImageUrl`로 검증값을 반환하며, 로고·배너·리뷰 사진·다른 옵션 이미지라고 판단하거나 확인하지 못하면 `null`로 남긴다.

## 프로모션·URL 변경 대응

- `discoveryPolicy: every_run` 상품은 승인 URL의 성공 여부와 관계없이 매 실행에서 최신 판매 페이지를 검색한다.
- 승인 URL이 종료·품절·리디렉션되면 해당 판매처 결과를 실패 또는 재매핑 필요로 기록하고 검색 결과를 `replacement` 후보로 추가한다.
- 새 기획·묶음이 발견되면 `promotion` 후보로 추가한다. 이미 존재하는 동일 URL 후보는 갱신하되 승인 상태는 보존한다.
- 후보에는 `totalQuantity`, `quantityUnit`, `candidateKind`, 교체 대상이 있으면 `replacesUrl`을 기록한다.
- 공개 Pages에서는 후보, 리뷰 상태와 원본 URL을 읽기 전용으로 확인한다. 일상적인 수동 승인·거절 단계는 두지 않는다.

## 저장과 배포

- 결과는 `src/lib/schema.ts`의 `collectorPayloadSchema`를 통과해야 한다.
- 임시 payload를 `web/.collector-result.json`에 만든 뒤 `npm run data:import -- .collector-result.json`으로 가져온다.
- 가져오기 후 `npm run data:rebuild`가 `products.csv`와 `latest-prices.csv`를 실제 저장 데이터에서 다시 생성한다. CSV에 가격을 직접 작성하지 않는다.
- `npm run lint`와 `npm run build`가 모두 성공한 경우에만 공개 데이터 파일을 커밋한다.
- 커밋 대상은 `web/public/data/*.json`, `web/public/data/*.jsonl`, 자동 생성된 `web/public/data/*.csv`뿐이다.
- 커밋 메시지는 `data: refresh prices YYYY-MM-DD` 형식이다. `main`에 일반 push만 사용하고 force push는 금지한다.
- 원격 `main`이 앞서 있거나 push가 거절되면 로컬 데이터를 보존하고 실행 결과에 배포 실패를 보고한다.
