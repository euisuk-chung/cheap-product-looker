import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { MarketCandidate, Product, ProductSnapshot, PublicSnapshot, Source } from './lib/schema';

type AdminState = {
  sources: Source[];
  products: Product[];
  candidates: MarketCandidate[];
  snapshot: PublicSnapshot;
};

const emptySnapshot: PublicSnapshot = {
  generatedAt: new Date(0).toISOString(),
  activeProductCount: 0,
  pendingProductCount: 0,
  pendingReviewCount: 0,
  latestSuccessfulRunAt: null,
  sources: [],
  products: [],
  runs: [],
};

function routeFromHash() {
  return window.location.hash.replace(/^#/, '') || '/';
}

function money(value: number | null | undefined) {
  return value == null ? '비교 불가' : `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}

function unitMoney(value: number | null | undefined, unit: 'g' | 'ml') {
  return value == null ? '비교 불가' : `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value)}원/${unit}`;
}

function candidateUnitPrice(candidate: MarketCandidate) {
  if (candidate.observedPrice === null || candidate.shippingFee === null || candidate.stockStatus !== 'in_stock') return null;
  return (candidate.observedPrice + candidate.shippingFee) / candidate.totalQuantity;
}

function dateTime(value: string | null | undefined) {
  if (!value) return '아직 없음';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value));
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new Error('로컬 관리 서버에 연결할 수 없습니다.');
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? '요청을 처리하지 못했습니다.');
  return body as T;
}

function Header({ route }: { route: string }) {
  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label="화장품 최저가 기록장 홈"><img className="brand-mark" src={`${import.meta.env.BASE_URL}favicon.png`} alt="" /><span>PRICE CABINET</span></a>
      <nav aria-label="주요 메뉴">
        <a className={`nav-link ${route !== '/admin' ? 'active' : ''}`} href="#/">가격 보드</a>
        <a className={`nav-link ${route === '/admin' ? 'active' : ''}`} href="#/admin">추적 현황</a>
      </nav>
    </header>
  );
}

function MarketPrice({ product, source }: { product: ProductSnapshot; source: Source }) {
  const observation = product.latestBySource[source.id];
  const winner = product.bestPurchase?.sourceId === source.id;
  const purchaseUrl = observation?.sourceUrl ?? product.markets[source.id]?.approvedUrl;
  return (
    <div className={`market-price ${winner ? 'winner' : ''}`}>
      <div className="market-name"><i style={{ background: source.accent }} />{source.label}{winner && <b>LOWEST</b>}</div>
      {!observation ? <p className="muted">수집 전</p> : (
        <>
          <strong>{unitMoney(observation.unitPrice, observation.quantityUnit)}</strong>
          <span className="price-parts">총액 {money(observation.totalPrice)} · 구성 {observation.totalQuantity}{observation.quantityUnit}</span>
          <span className="price-parts">상품 {money(observation.productPrice)} · 배송 {observation.shippingFee == null ? '확인 불가' : money(observation.shippingFee)}</span>
          <span className={`data-status ${observation.isFresh ? '' : 'stale'}`}>{observation.stockStatus === 'out_of_stock' ? '품절' : observation.isFresh ? '최신' : '오래됨'} · {dateTime(observation.capturedAt)}</span>
        </>
      )}
      {purchaseUrl && <a className="market-buy-link" href={purchaseUrl} target="_blank" rel="noreferrer">구매 페이지 ↗</a>}
    </div>
  );
}

function ProductCard({ product, sources }: { product: ProductSnapshot; sources: Source[] }) {
  const unitPrices = Object.values(product.latestBySource).filter((item) => item?.isFresh && item.comparable && item.unitPrice !== null && item.quantityUnit === product.comparisonUnit).map((item) => item.unitPrice as number).sort((a, b) => a - b);
  const difference = unitPrices.length > 1 ? unitPrices.at(-1)! - unitPrices[0] : null;
  const bestSource = sources.find((source) => source.id === product.bestPurchase?.sourceId);
  return (
    <article className="product-card">
      <div className="product-info">
        <p className="eyebrow">{product.brand}</p>
        <h3>{product.name}</h3>
        <span>{product.capacity}{product.variant ? ` · ${product.variant}` : ''}</span>
        {product.bestPurchase && <a className="best-buy-button" href={product.bestPurchase.url} target="_blank" rel="noreferrer"><span>현재 최저가 구매</span><strong>{unitMoney(product.bestPurchase.unitPrice, product.bestPurchase.quantityUnit)}</strong><small>{bestSource?.label ?? product.bestPurchase.sourceId} · {product.bestPurchase.basis === 'observation' ? product.bestPurchase.isFresh ? '최신 검증' : '마지막 검증값' : '기존 확인 후보'} ↗</small></a>}
        <a className="text-link" href={`#/product/${product.id}`}>가격 이력 보기 <span aria-hidden="true">→</span></a>
      </div>
      <div className="market-grid">{sources.map((source) => <MarketPrice key={source.id} product={product} source={source} />)}</div>
      <div className="difference"><span>단위가 차이</span><strong>{difference == null ? '—' : unitMoney(difference, product.comparisonUnit)}</strong></div>
    </article>
  );
}

function Dashboard({ snapshot }: { snapshot: PublicSnapshot }) {
  return (
    <main>
      <section className="hero">
        <div><p className="eyebrow">COUPANG × OLIVE YOUNG</p><h1>오늘의 화장품 가격,<br />용량까지 공정하게.</h1><p className="hero-copy">일반 구매 총액을 판매 구성의 총용량으로 나눠 원/g 또는 원/ml 기준으로 매일 비교합니다.</p></div>
        <div className="hero-seal" aria-label="매일 오전 9시 업데이트"><span>DAILY</span><strong>09:00</strong><small>SEOUL</small></div>
      </section>
      <section className="summary-grid" aria-label="수집 현황">
        <article className="metric-card"><span>추적 중</span><strong>{snapshot.activeProductCount}</strong><small>개 상품</small></article>
        <article className="metric-card"><span>자동 검증 대기</span><strong>{snapshot.pendingReviewCount}</strong><small>개 후보</small></article>
        <article className="metric-card wide"><span>마지막 수집</span><strong className="metric-date">{dateTime(snapshot.latestSuccessfulRunAt)}</strong><small>실제 페이지 확인 기준</small></article>
      </section>
      <section className="board-heading"><div><p className="eyebrow">LIVE PRICE BOARD</p><h2>단위 가격 비교 보드</h2></div><div className="board-actions"><span className="freshness"><i /> 36시간 이내 배송 포함 단위가만 판정</span><a className="csv-link" href={`${import.meta.env.BASE_URL}data/latest-prices.csv`} download>최신 가격 CSV ↓</a></div></section>
      {snapshot.products.length ? <section className="product-list">{snapshot.products.map((product) => <ProductCard key={product.id} product={product} sources={snapshot.sources} />)}</section> : (
        <section className="empty-state"><div className="empty-orbit" aria-hidden="true"><span>₩</span></div><p className="eyebrow">READY TO TRACK</p><h2>{snapshot.pendingProductCount ? `${snapshot.pendingProductCount}개 상품을 조사하고 있어요.` : '첫 가격 조사를 기다리고 있어요.'}</h2><p>조사 에이전트가 판매 링크를 찾고 리뷰 에이전트가 검증하면 최저가 구매 링크가 자동으로 반영됩니다.</p><a className="primary-button" href="#/admin">추적 상태 보기</a></section>
      )}
    </main>
  );
}

function PriceChart({ product, sources }: { product: ProductSnapshot; sources: Source[] }) {
  const points = product.history.filter((item) => item.unitPrice !== null && item.quantityUnit === product.comparisonUnit).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  if (!points.length) return <div className="chart-empty">아직 비교 가능한 가격 이력이 없습니다.</div>;
  const times = [...new Set(points.map((point) => Date.parse(point.capturedAt)))].sort((a, b) => a - b);
  const values = points.map((point) => point.unitPrice as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (time: number) => times.length === 1 ? 50 : 6 + ((time - times[0]) / (times.at(-1)! - times[0])) * 88;
  const y = (value: number) => max === min ? 50 : 88 - ((value - min) / (max - min)) * 72;
  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${product.name} 가격 이력 그래프`}>
        {[20, 50, 80].map((line) => <line key={line} x1="3" x2="97" y1={line} y2={line} className="grid-line" />)}
        {sources.map((source) => {
          const series = points.filter((point) => point.sourceId === source.id);
          if (!series.length) return null;
          const path = series.map((point, index) => `${index ? 'L' : 'M'} ${x(Date.parse(point.capturedAt))} ${y(point.unitPrice as number)}`).join(' ');
          return <g key={source.id}><path d={path} fill="none" stroke={source.accent} strokeWidth="1.3" vectorEffect="non-scaling-stroke" />{series.map((point) => <circle key={point.id} cx={x(Date.parse(point.capturedAt))} cy={y(point.unitPrice as number)} r="1.8" fill={source.accent} vectorEffect="non-scaling-stroke" />)}</g>;
        })}
      </svg>
      <div className="chart-legend">{sources.map((source) => <span key={source.id}><i style={{ background: source.accent }} />{source.label}</span>)}</div>
    </div>
  );
}

function ProductDetail({ product, sources }: { product: ProductSnapshot; sources: Source[] }) {
  return (
    <main className="detail-page">
      <a className="back-link" href="#/">← 가격 보드</a>
      <section className="detail-heading"><p className="eyebrow">{product.brand}</p><h1>{product.name}</h1><p>{product.capacity}{product.variant ? ` · ${product.variant}` : ''}</p></section>
      <section className="detail-prices">{sources.map((source) => <MarketPrice key={source.id} product={product} source={source} />)}</section>
      <section className="history-panel"><div className="board-heading"><div><p className="eyebrow">UNIT PRICE HISTORY</p><h2>단위 가격 이력</h2></div><span>{product.history.length}개 실제 관측값 · 원/{product.comparisonUnit}</span></div><PriceChart product={product} sources={sources} /></section>
    </main>
  );
}

function CandidateCard({ candidate, source, lowest, current }: { candidate: MarketCandidate; source?: Source; lowest: boolean; current: boolean }) {
  const totalPrice = candidate.observedPrice !== null && candidate.shippingFee !== null ? candidate.observedPrice + candidate.shippingFee : null;
  const unitPrice = candidateUnitPrice(candidate);
  const kind = candidate.candidateKind === 'promotion' ? '프로모션' : candidate.candidateKind === 'replacement' ? '교체' : '최초';
  const reviewStatus = candidate.reviewStatus ?? 'pending';
  return (
    <article className={`candidate-card ${lowest ? 'lowest-candidate' : ''}`}>
      <div className="candidate-head"><div><span className="market-pill" style={{ borderColor: source?.accent }}>{source?.label ?? candidate.sourceId}</span>{lowest && <span className="lowest-pill">발견 후보 최저 단가</span>}{current && <span className="current-pill">현재 추적 URL</span>}</div><span className={`confidence ${candidate.confidence}`}>신뢰도 {candidate.confidence}</span></div>
      <h4>{candidate.title}</h4><p>{candidate.packageDescription} · {candidate.seller ?? '판매자 확인 필요'}</p>
      <dl><div><dt>배송 포함 단위가</dt><dd>{unitMoney(unitPrice, candidate.quantityUnit)}</dd></div><div><dt>일반 구매 총액</dt><dd>{money(totalPrice)}</dd></div><div><dt>상품가 / 배송비</dt><dd>{money(candidate.observedPrice)} / {candidate.shippingFee == null ? '확인 필요' : money(candidate.shippingFee)}</dd></div><div><dt>총용량</dt><dd>{candidate.totalQuantity}{candidate.quantityUnit}</dd></div><div><dt>후보 유형</dt><dd>{kind}</dd></div><div><dt>근거</dt><dd>{candidate.matchReason}</dd></div></dl>
      <a className="source-link" href={candidate.url} target="_blank" rel="noreferrer">공식 상품 페이지 열기 ↗</a>
      <span className={`decision ${reviewStatus}`}>{reviewStatus === 'passed' ? '리뷰 에이전트 검증 통과' : reviewStatus === 'failed' ? `검증 실패${candidate.reviewReason ? ` · ${candidate.reviewReason}` : ''}` : current ? '기존 추적 URL · 자동 검증 대기' : '자동 검증 대기'}</span>
    </article>
  );
}

function AdminPage({ onSnapshot }: { onSnapshot: (snapshot: PublicSnapshot) => void }) {
  const [state, setState] = useState<AdminState | null>(null);
  const [local, setLocal] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      await jsonRequest('/api/health');
      const next = await jsonRequest<AdminState>('/api/state');
      setState(next); setLocal(true); onSnapshot(next.snapshot);
    } catch {
      try {
        const readJson = async <T,>(name: string) => {
          const response = await fetch(`${import.meta.env.BASE_URL}data/${name}`, { cache: 'no-store' });
          if (!response.ok) throw new Error(name);
          return response.json() as Promise<T>;
        };
        const [sources, products, candidates, publicSnapshot] = await Promise.all([readJson<Source[]>('sources.json'), readJson<Product[]>('products.json'), readJson<MarketCandidate[]>('candidates.json'), readJson<PublicSnapshot>('snapshot.json')]);
        setState({ sources, products, candidates, snapshot: publicSnapshot }); setLocal(false); onSnapshot(publicSnapshot);
      } catch { setState(null); setLocal(false); }
    }
  }, [onSnapshot]);

  useEffect(() => { refresh(); }, [refresh]);

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      await jsonRequest('/api/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) });
      event.currentTarget.reset(); setNotice('조사 대기 상품을 등록했습니다.'); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : '등록하지 못했습니다.'); }
    finally { setBusy(false); }
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    const file = new FormData(event.currentTarget).get('productsCsv');
    try {
      if (!(file instanceof File) || !file.size) throw new Error('가져올 CSV 파일을 선택해 주세요.');
      await jsonRequest('/api/products/import-csv', { method: 'POST', headers: { 'content-type': 'text/csv' }, body: await file.text() });
      event.currentTarget.reset(); setNotice('CSV 상품 정보를 검증해 반영했습니다.'); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'CSV를 가져오지 못했습니다.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="admin-page">
      <section className="admin-heading"><p className="eyebrow">{local === false ? 'PUBLIC STATUS' : 'LOCAL OPERATIONS'}</p><h1>자동 추적 관리</h1><p>조사 → 에이전트 검증 → 최저가 기록·반영 상태를 확인합니다.</p></section>
      {local === false && <section className="readonly-banner"><strong>공개 추적 현황입니다.</strong><p>후보 구성, 단위가, 검증 상태와 실제 판매 URL을 확인할 수 있습니다. 링크 선택과 가격 반영은 리뷰 에이전트가 자동 처리합니다.</p></section>}
      {local === null && <section className="readonly-banner"><p>로컬 관리 기능을 확인하고 있습니다.</p></section>}
      {local && state && <>
        <section className="csv-panel">
          <div><p className="eyebrow">CSV WORKFLOW</p><h2>표로 한꺼번에 관리</h2><p>상품 CSV를 내려받아 수정한 뒤 다시 가져오세요. 현재 추적 URL은 확인용이며 새 상품은 ID를 비워 둡니다.</p><div className="csv-links"><a className="csv-link" href={`${import.meta.env.BASE_URL}data/products.csv`} download>상품 목록 CSV ↓</a><a className="csv-link" href={`${import.meta.env.BASE_URL}data/latest-prices.csv`} download>최신 가격 CSV ↓</a></div></div>
          <form className="csv-import" onSubmit={importCsv}><label>수정한 상품 CSV<input name="productsCsv" type="file" accept=".csv,text/csv" required /></label><button className="primary-button" disabled={busy}>검증 후 가져오기</button></form>
        </section>
        <section className="admin-grid">
          <form className="product-form" onSubmit={submitProduct}><p className="eyebrow">NEW RESEARCH REQUEST</p><h2>새 화장품 등록</h2><label>브랜드<input name="brand" required maxLength={80} placeholder="예: 라운드랩" /></label><label>상품명<input name="name" required maxLength={160} placeholder="예: 자작나무 수분 크림" /></label><div className="field-row"><label>기준 용량<input name="capacity" required maxLength={80} placeholder="예: 80ml" /></label><label>단위<select name="comparisonUnit" required defaultValue="ml"><option value="ml">ml</option><option value="g">g</option></select></label></div><label>색상·구성<input name="variant" maxLength={120} placeholder="예: 판매 구성별 총용량 환산" /></label><button className="primary-button form-submit" disabled={busy}>조사 대기에 추가</button></form>
          <aside className="admin-guide"><span>01</span><h3>상품 등록</h3><p>브랜드와 정확한 용량·구성을 적습니다.</p><span>02</span><h3>판매처 조사</h3><p>매일 9시 두 조사 에이전트가 실제 후보를 찾습니다.</p><span>03</span><h3>검증·자동 반영</h3><p>리뷰 에이전트를 통과한 최저 단가 링크를 기록합니다.</p></aside>
        </section>
        {notice && <p className="notice" role="status">{notice}</p>}
      </>}
      {state && <section className="review-section"><div className="board-heading"><div><p className="eyebrow">TRACKING PIPELINE</p><h2>조사·검증 상태</h2></div><span>{state.candidates.filter((item) => (item.reviewStatus ?? 'pending') === 'pending' && item.status !== 'rejected').length}개 자동 검증 대기</span></div>
        {state.products.map((product) => {
          const candidates = state.candidates.filter((item) => item.productId === product.id).sort((left, right) => {
            if (left.sourceId !== right.sourceId) return left.sourceId.localeCompare(right.sourceId);
            return (candidateUnitPrice(left) ?? Number.POSITIVE_INFINITY) - (candidateUnitPrice(right) ?? Number.POSITIVE_INFINITY);
          });
          const lowestIds = new Set(state.sources.flatMap((source) => {
            const priced = candidates.filter((candidate) => candidate.sourceId === source.id && candidate.status !== 'rejected').map((candidate) => ({ id: candidate.id, price: candidateUnitPrice(candidate) })).filter((item): item is { id: string; price: number } => item.price !== null);
            if (!priced.length) return [];
            const minimum = Math.min(...priced.map((item) => item.price));
            return priced.filter((item) => item.price === minimum).map((item) => item.id);
          }));
          return <div className="review-group" key={product.id}><div className="review-title"><div><span>{product.brand}</span><h3>{product.name} {product.capacity}</h3><p>{product.variant || '기본 구성'} · {product.comparisonUnit} 단위 비교 · 상태 {product.status}</p></div></div><div className="candidate-grid">{candidates.length ? candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} source={state.sources.find((source) => source.id === candidate.sourceId)} lowest={lowestIds.has(candidate.id)} current={product.markets[candidate.sourceId]?.approvedUrl === candidate.url} />) : <p className="candidate-empty">다음 스케줄에서 실제 판매처 후보를 조사합니다.</p>}</div></div>;
        })}
      </section>}
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [snapshot, setSnapshot] = useState<PublicSnapshot>(emptySnapshot);

  const loadSnapshot = useCallback(() => {
    fetch(`${import.meta.env.BASE_URL}data/snapshot.json`, { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error('snapshot unavailable');
      return response.json();
    }).then(setSnapshot).catch(() => setSnapshot(emptySnapshot));
  }, []);

  useEffect(() => { loadSnapshot(); const handler = () => setRoute(routeFromHash()); window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler); }, [loadSnapshot]);
  const productId = route.startsWith('/product/') ? route.slice('/product/'.length) : null;
  const detail = useMemo(() => snapshot.products.find((product) => product.id === productId), [productId, snapshot.products]);

  return (
    <div className="app-shell">
      <Header route={route} />
      {route === '/admin' ? <AdminPage onSnapshot={setSnapshot} /> : detail ? <ProductDetail product={detail} sources={snapshot.sources} /> : <Dashboard snapshot={snapshot} />}
      <footer><span>가격은 수집 시점 이후 달라질 수 있습니다.</span><span>일반 구매 총액 ÷ 판매 구성 총용량 · KRW</span></footer>
    </div>
  );
}
