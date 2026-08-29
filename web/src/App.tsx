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
      <a className="brand" href="#/" aria-label="화장품 최저가 기록장 홈"><span className="brand-mark" aria-hidden="true">₩</span><span>PRICE CABINET</span></a>
      <nav aria-label="주요 메뉴">
        <a className={`nav-link ${route !== '/admin' ? 'active' : ''}`} href="#/">가격 보드</a>
        <a className={`nav-link ${route === '/admin' ? 'active' : ''}`} href="#/admin">상품 관리</a>
      </nav>
    </header>
  );
}

function MarketPrice({ product, source }: { product: ProductSnapshot; source: Source }) {
  const observation = product.latestBySource[source.id];
  const winner = product.winnerSourceIds.includes(source.id);
  return (
    <div className={`market-price ${winner ? 'winner' : ''}`}>
      <div className="market-name"><i style={{ background: source.accent }} />{source.label}{winner && <b>LOWEST</b>}</div>
      {!observation ? <p className="muted">수집 전</p> : (
        <>
          <strong>{money(observation.totalPrice)}</strong>
          <span className="price-parts">상품 {money(observation.productPrice)} · 배송 {observation.shippingFee == null ? '확인 불가' : money(observation.shippingFee)}</span>
          <span className={`data-status ${observation.isFresh ? '' : 'stale'}`}>{observation.stockStatus === 'out_of_stock' ? '품절' : observation.isFresh ? '최신' : '오래됨'} · {dateTime(observation.capturedAt)}</span>
        </>
      )}
    </div>
  );
}

function ProductCard({ product, sources }: { product: ProductSnapshot; sources: Source[] }) {
  const totals = Object.values(product.latestBySource).filter((item) => item?.isFresh && item.comparable && item.totalPrice !== null).map((item) => item.totalPrice as number).sort((a, b) => a - b);
  const difference = totals.length > 1 ? totals.at(-1)! - totals[0] : null;
  return (
    <article className="product-card">
      <div className="product-info">
        <p className="eyebrow">{product.brand}</p>
        <h3>{product.name}</h3>
        <span>{product.capacity}{product.variant ? ` · ${product.variant}` : ''}</span>
        <a className="text-link" href={`#/product/${product.id}`}>가격 이력 보기 <span aria-hidden="true">→</span></a>
      </div>
      <div className="market-grid">{sources.map((source) => <MarketPrice key={source.id} product={product} source={source} />)}</div>
      <div className="difference"><span>현재 차이</span><strong>{difference == null ? '—' : money(difference)}</strong></div>
    </article>
  );
}

function Dashboard({ snapshot }: { snapshot: PublicSnapshot }) {
  return (
    <main>
      <section className="hero">
        <div><p className="eyebrow">COUPANG × OLIVE YOUNG</p><h1>오늘의 화장품 가격,<br />조건 없이 또렷하게.</h1><p className="hero-copy">카드 할인과 멤버십 가격을 걷어내고, 누구나 살 수 있는 상품가와 배송비만 매일 기록합니다.</p></div>
        <div className="hero-seal" aria-label="매일 오전 9시 업데이트"><span>DAILY</span><strong>09:00</strong><small>SEOUL</small></div>
      </section>
      <section className="summary-grid" aria-label="수집 현황">
        <article className="metric-card"><span>추적 중</span><strong>{snapshot.activeProductCount}</strong><small>개 상품</small></article>
        <article className="metric-card"><span>승인 대기</span><strong>{snapshot.pendingProductCount}</strong><small>개 상품</small></article>
        <article className="metric-card wide"><span>마지막 수집</span><strong className="metric-date">{dateTime(snapshot.latestSuccessfulRunAt)}</strong><small>실제 페이지 확인 기준</small></article>
      </section>
      <section className="board-heading"><div><p className="eyebrow">LIVE PRICE BOARD</p><h2>가격 비교 보드</h2></div><span className="freshness"><i /> 36시간 이내 데이터만 최저가 판정</span></section>
      {snapshot.products.length ? <section className="product-list">{snapshot.products.map((product) => <ProductCard key={product.id} product={product} sources={snapshot.sources} />)}</section> : (
        <section className="empty-state"><div className="empty-orbit" aria-hidden="true"><span>₩</span></div><p className="eyebrow">READY TO TRACK</p><h2>{snapshot.pendingProductCount ? `${snapshot.pendingProductCount}개 상품이 승인을 기다려요.` : '첫 상품 조사를 기다리고 있어요.'}</h2><p>로컬 상품 관리에서 두 판매처의 실제 후보를 확인하고 승인하면 가격 추적이 시작됩니다.</p><a className="primary-button" href="#/admin">후보 검토하기</a></section>
      )}
    </main>
  );
}

function PriceChart({ product, sources }: { product: ProductSnapshot; sources: Source[] }) {
  const points = product.history.filter((item) => item.totalPrice !== null).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  if (!points.length) return <div className="chart-empty">아직 비교 가능한 가격 이력이 없습니다.</div>;
  const times = [...new Set(points.map((point) => Date.parse(point.capturedAt)))].sort((a, b) => a - b);
  const values = points.map((point) => point.totalPrice as number);
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
          const path = series.map((point, index) => `${index ? 'L' : 'M'} ${x(Date.parse(point.capturedAt))} ${y(point.totalPrice as number)}`).join(' ');
          return <g key={source.id}><path d={path} fill="none" stroke={source.accent} strokeWidth="1.3" vectorEffect="non-scaling-stroke" />{series.map((point) => <circle key={point.id} cx={x(Date.parse(point.capturedAt))} cy={y(point.totalPrice as number)} r="1.8" fill={source.accent} vectorEffect="non-scaling-stroke" />)}</g>;
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
      <section className="history-panel"><div className="board-heading"><div><p className="eyebrow">PRICE HISTORY</p><h2>가격 이력</h2></div><span>{product.history.length}개 실제 관측값</span></div><PriceChart product={product} sources={sources} /></section>
    </main>
  );
}

function CandidateCard({ candidate, source, onDecision, busy }: { candidate: MarketCandidate; source?: Source; onDecision: (id: string, decision: 'approved' | 'rejected') => void; busy: boolean }) {
  return (
    <article className="candidate-card">
      <div className="candidate-head"><span className="market-pill" style={{ borderColor: source?.accent }}>{source?.label ?? candidate.sourceId}</span><span className={`confidence ${candidate.confidence}`}>신뢰도 {candidate.confidence}</span></div>
      <h4>{candidate.title}</h4><p>{candidate.packageDescription} · {candidate.seller ?? '판매자 확인 필요'}</p>
      <dl><div><dt>발견 가격</dt><dd>{money(candidate.observedPrice)}</dd></div><div><dt>배송비</dt><dd>{candidate.shippingFee == null ? '확인 필요' : money(candidate.shippingFee)}</dd></div><div><dt>근거</dt><dd>{candidate.matchReason}</dd></div></dl>
      <a className="source-link" href={candidate.url} target="_blank" rel="noreferrer">공식 상품 페이지 열기 ↗</a>
      {candidate.status === 'pending' ? <div className="candidate-actions"><button disabled={busy} className="approve-button" onClick={() => onDecision(candidate.id, 'approved')}>이 후보 승인</button><button disabled={busy} className="reject-button" onClick={() => onDecision(candidate.id, 'rejected')}>거절</button></div> : <span className={`decision ${candidate.status}`}>{candidate.status === 'approved' ? '승인됨' : '거절됨'}</span>}
    </article>
  );
}

function AdminPage({ snapshot, onSnapshot }: { snapshot: PublicSnapshot; onSnapshot: (snapshot: PublicSnapshot) => void }) {
  const [state, setState] = useState<AdminState | null>(null);
  const [local, setLocal] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      await jsonRequest('/api/health');
      const next = await jsonRequest<AdminState>('/api/state');
      setState(next); setLocal(true); onSnapshot(next.snapshot);
    } catch { setLocal(false); }
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

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setBusy(true); setNotice('');
    try { await jsonRequest(`/api/candidates/${id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) }); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '처리하지 못했습니다.'); }
    finally { setBusy(false); }
  }

  async function requestResearch(productId: string) {
    setBusy(true); setNotice('');
    try { await jsonRequest(`/api/products/${productId}/research`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); setNotice('다음 수집에서 후보를 다시 조사합니다.'); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '처리하지 못했습니다.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="admin-page">
      <section className="admin-heading"><p className="eyebrow">LOCAL ADMIN</p><h1>상품 관리</h1><p>실제 상품 후보를 확인하고 두 판매처 URL을 각각 승인합니다.</p></section>
      {local === false && <section className="readonly-banner"><strong>읽기 전용 공개판입니다.</strong><p>상품 등록과 후보 승인은 로컬에서 관리 서버를 함께 실행했을 때만 사용할 수 있습니다. 현재 승인 대기 상품은 {snapshot.pendingProductCount}개입니다.</p></section>}
      {local === null && <section className="readonly-banner"><p>로컬 관리 기능을 확인하고 있습니다.</p></section>}
      {local && state && <>
        <section className="admin-grid">
          <form className="product-form" onSubmit={submitProduct}><p className="eyebrow">NEW RESEARCH REQUEST</p><h2>새 화장품 등록</h2><label>브랜드<input name="brand" required maxLength={80} placeholder="예: 라운드랩" /></label><label>상품명<input name="name" required maxLength={160} placeholder="예: 1025 독도 토너" /></label><div className="field-row"><label>용량<input name="capacity" required maxLength={80} placeholder="예: 200ml" /></label><label>색상·구성<input name="variant" maxLength={120} placeholder="예: 단품" /></label></div><button className="primary-button form-submit" disabled={busy}>조사 대기에 추가</button></form>
          <aside className="admin-guide"><span>01</span><h3>상품 등록</h3><p>브랜드와 정확한 용량·구성을 적습니다.</p><span>02</span><h3>에이전트 조사</h3><p>매일 9시 두 판매처의 실제 후보를 찾습니다.</p><span>03</span><h3>URL 승인</h3><p>두 후보를 승인하면 가격 추적이 시작됩니다.</p></aside>
        </section>
        {notice && <p className="notice" role="status">{notice}</p>}
        <section className="review-section"><div className="board-heading"><div><p className="eyebrow">CANDIDATE REVIEW</p><h2>후보 검토</h2></div><span>{state.candidates.filter((item) => item.status === 'pending').length}개 승인 대기</span></div>
          {state.products.map((product) => {
            const candidates = state.candidates.filter((item) => item.productId === product.id);
            return <div className="review-group" key={product.id}><div className="review-title"><div><span>{product.brand}</span><h3>{product.name} {product.capacity}</h3><p>{product.variant || '기본 구성'} · 상태 {product.status}</p></div><button className="text-button" disabled={busy} onClick={() => requestResearch(product.id)}>재조사 요청</button></div><div className="candidate-grid">{candidates.length ? candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} source={state.sources.find((source) => source.id === candidate.sourceId)} onDecision={decide} busy={busy} />) : <p className="candidate-empty">다음 스케줄에서 실제 판매처 후보를 조사합니다.</p>}</div></div>;
          })}
        </section>
      </>}
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
      {route === '/admin' ? <AdminPage snapshot={snapshot} onSnapshot={setSnapshot} /> : detail ? <ProductDetail product={detail} sources={snapshot.sources} /> : <Dashboard snapshot={snapshot} />}
      <footer><span>가격은 수집 시점 이후 달라질 수 있습니다.</span><span>일반 구매 총액 기준 · KRW</span></footer>
    </div>
  );
}
