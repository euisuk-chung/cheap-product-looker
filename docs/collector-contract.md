# Codex 가격 수집 계약

이 문서는 매일 실행되는 Codex 코디네이터와 판매처 서브에이전트가 지켜야 하는 데이터 계약이다.

## 조사 원칙

- 한 번의 실행에서 정확히 두 서브에이전트를 병렬로 사용한다: `coupang`, `oliveyoung`.
- 서브에이전트는 조사만 하고 파일을 수정하지 않는다. 코디네이터만 검증·병합·커밋한다.
- 가격, 배송비, 재고, 판매자, 후보 URL은 실행 시점의 공식 상품 페이지에서 확인한다. Mock, fixture, 예시 가격, 이전 가격 복사는 금지한다.
- 로그인, CAPTCHA, 접근 차단을 우회하지 않는다. 확인할 수 없는 값은 추정하지 않고 실패 또는 `null`로 남긴다.
- 활성 상품은 승인된 URL만 방문한다. 다른 옵션·판매자·묶음으로 자동 교체하지 않는다.
- 대기 상품은 공식 페이지 후보만 추가하고 자동 승인하지 않는다.

## 가격 판정

- `productPrice`에는 일반 비회원에게 공개된 상품가를 기록한다.
- `shippingFee`에는 모든 일반 구매자에게 필수인 배송비를 기록한다. 금액을 확정하지 못하면 `null`이다.
- 카드, 쿠폰, 와우, CJ ONE 등 조건부 혜택은 `benefitNote`에만 기록한다.
- 배송비가 `null`이면 `totalPrice: null`, `comparable: false`다.
- 재고가 `in_stock`이 아니면 `comparable: false`다.
- 용량·색상·세트 구성이 승인 매핑과 다르면 관측값을 만들지 않고 실행 오류에 남긴다.

## 저장과 배포

- 결과는 `src/lib/schema.ts`의 `collectorPayloadSchema`를 통과해야 한다.
- 임시 payload를 `web/.collector-result.json`에 만든 뒤 `npm run data:import -- .collector-result.json`으로 가져온다.
- `npm run lint`와 `npm run build`가 모두 성공한 경우에만 공개 데이터 파일을 커밋한다.
- 커밋 대상은 `web/public/data/*.json`과 `web/public/data/*.jsonl`뿐이다.
- 커밋 메시지는 `data: refresh prices YYYY-MM-DD` 형식이다. `main`에 일반 push만 사용하고 force push는 금지한다.
- 원격 `main`이 앞서 있거나 push가 거절되면 로컬 데이터를 보존하고 실행 결과에 배포 실패를 보고한다.
