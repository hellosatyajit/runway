import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Info, RefreshCw, Sparkles, WalletCards } from 'lucide-react'
import { fallbackData, loadRunway, refreshRunway } from './runwayApi'

const money = (value: number, currency = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency, maximumFractionDigits: 0,
}).format(value)

const shortMoney = (value: number) => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
  if (value >= 1000) return `₹${Math.round(value / 1000)}k`
  return money(value)
}

function runwayDate(months: number) {
  const date = new Date()
  date.setDate(date.getDate() + Math.round(months * 30.44))
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function App() {
  const [data, setData] = useState(fallbackData)
  const [includeInvestments, setIncludeInvestments] = useState(true)
  const [burn, setBurn] = useState<number>(fallbackData.burn)
  const [methodOpen, setMethodOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const available = data.liquid + (includeInvestments ? data.investments : 0) - data.debt
  const months = available / burn
  const days = Math.round(months * 30.44)
  const maxBar = Math.max(...data.monthlyBurn.map(item => item.value))
  const exactRunway = useMemo(() => runwayDate(months), [months])

  useEffect(() => {
    loadRunway().then(next => { setData(next); setBurn(next.burn) }).catch(() => setSyncError('Using saved snapshot'))
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    setSyncError('')
    try {
      const next = await refreshRunway()
      setData(next)
      setBurn(next.burn)
    } catch {
      setSyncError('Refresh unavailable')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="page-shell">
      <nav>
        <a className="brand" href="#top" aria-label="Personal runway home">
          <span className="brand-mark"><span /></span>
          <span>runway</span>
        </a>
        <div className="nav-actions">
          <div className="sync-pill"><span /> {syncError || `Fold synced · ${new Date(data.syncedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}</div>
          <button className="avatar" aria-label="Account">S</button>
        </div>
      </nav>

      <main id="top">
        <section className="hero">
          <p className="eyebrow">Your personal runway</p>
          <div className="headline-row">
            <h1>{months.toFixed(1)} <span>months</span></h1>
            <div className="hero-context">
              <div className="status-dot"><span /></div>
              <p>If your income stopped today,<br />your money lasts until <strong>{exactRunway}</strong>.</p>
            </div>
          </div>
          <div className="runway-track" aria-label={`${months.toFixed(1)} months of runway`}>
            <div className="track-fill" style={{ width: `${Math.min(months / 6 * 100, 100)}%` }}>
              <span className="plane">✦</span>
            </div>
            <div className="track-labels"><span>Today</span><span>3 months</span><span>6 months</span></div>
          </div>
          <p className="hero-note">Based on {shortMoney(available)} available and a {shortMoney(burn)} monthly burn.</p>
        </section>

        <section className="content-grid">
          <div className="panel controls-panel">
            <div className="panel-heading">
              <div><p className="section-kicker">What counts</p><h2>Your runway, your rules.</h2></div>
              <Sparkles size={20} strokeWidth={1.7} />
            </div>

            <div className="asset-list">
              <div className="asset-row active">
                <div className="asset-icon"><WalletCards size={19} /></div>
                <div><strong>Cash in bank</strong><span>Ready to spend</span></div>
                <b>{money(data.liquid)}</b>
                <span className="check"><Check size={14} /></span>
              </div>
              <button className={`asset-row ${includeInvestments ? 'active' : ''}`} onClick={() => setIncludeInvestments(v => !v)}>
                <div className="asset-icon investment-icon">↗</div>
                <div><strong>Investments</strong><span>Mutual funds + stocks</span></div>
                <b>{money(data.investments)}</b>
                <span className="check">{includeInvestments && <Check size={14} />}</span>
              </button>
            </div>

            <div className="burn-control">
              <div className="burn-label"><div><span>Monthly burn</span><button aria-label="About monthly burn"><Info size={14} /></button></div><strong>{money(burn)}</strong></div>
              <input aria-label="Monthly burn" type="range" min="30000" max="120000" step="1000" value={burn} onChange={e => setBurn(Number(e.target.value))} />
              <div className="range-labels"><span>Lean · ₹30k</span><span>Current · ₹61k</span><span>₹1.2L · High</span></div>
            </div>

            <div className="scenario-callout">
              <div><span className="scenario-icon">{includeInvestments ? '↗' : '−'}</span></div>
              <p>{includeInvestments
                ? <>Including investments adds <strong>{(data.investments / burn).toFixed(1)} months</strong> to your runway.</>
                : <>Keeping investments untouched leaves <strong>{Math.round((data.liquid / burn) * 30.44)} days</strong> of liquid runway.</>
              }</p>
            </div>
          </div>

          <div className="panel breakdown-panel">
            <div className="panel-heading">
              <div><p className="section-kicker">Your burn rate</p><h2>{shortMoney(data.burn)} <small>/ month</small></h2></div>
              <button className="icon-button" aria-label="Refresh Fold data" onClick={handleRefresh} disabled={refreshing}><RefreshCw size={17} className={refreshing ? 'spin' : ''} /></button>
            </div>
            <p className="muted">Average adjusted outflow over the last 3 complete months.</p>
            <div className="chart">
              {data.monthlyBurn.map(item => (
                <div className="bar-group" key={item.label}>
                  <span className="bar-value">{shortMoney(item.value)}</span>
                  <div className="bar-track"><div className="bar" style={{ height: `${item.value / maxBar * 100}%` }} /></div>
                  <span className="bar-label">{item.label}</span>
                </div>
              ))}
              <div className="average-line" style={{ bottom: `${64 + (data.burn / maxBar * 190)}px` }}><span>average</span></div>
            </div>
            <button className="method-button" onClick={() => setMethodOpen(v => !v)} aria-expanded={methodOpen}>
              <span>How this is calculated</span><ChevronDown size={18} className={methodOpen ? 'rotate' : ''} />
            </button>
            {methodOpen && <div className="method-copy">We average cash outflows from Jun–Aug, excluding {data.excludedCategories.join(', ')}. Adjust the slider to model a leaner or more generous life.</div>}
          </div>
        </section>

        <section className="bottom-strip">
          <div><p className="section-kicker">The honest answer</p><h3>{days} days of freedom, at today’s pace.</h3></div>
          <a href="#top">Try a lean-month scenario <ArrowRight size={17} /></a>
        </section>
      </main>

      <footer><span>Private by design. Your data stays yours.</span><span>Numbers synced from Fold Money</span></footer>
    </div>
  )
}
