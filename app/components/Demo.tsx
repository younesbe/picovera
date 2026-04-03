'use client'

import { useState, useEffect, useRef } from 'react'
import { FRENCH_REGIONS } from '../types/rte'
import type { FrenchRegion } from '../types/rte'

// ── Types ────────────────────────────────────────────────────────────────────

interface AssetConfig {
  capacityMwh: number
  powerMw: number
  rtePercent: number
  region: FrenchRegion
  contractType: 'free' | 'fcr' | 'afrr' | 'mfrr'
}

interface SimulationResult {
  netCo2: number
  greenIn: number
  greenOut: number
  gigoRatio: number
  dispatch: DispatchSlot[]
  baselineEmissions: number[]
  actualEmissions: number[]
  mefProfile: number[]
  certId: string
  certDate: string
  avgMef: number
  isSimulated: boolean
  region: string
  capacityMwh: number
  powerMw: number
  rtePercent: number
}

interface DispatchSlot {
  hour: number
  mef: number
  action: 'charge' | 'discharge' | 'idle'
  powerMw: number
  socPct: number
  co2Impact: number
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: AssetConfig = {
  capacityMwh:  10,
  powerMw:       5,
  rtePercent:   90,
  region:       'Île-de-France',
  contractType: 'free',
}

const CONTRACT_LABELS: Record<string, string> = {
  free:  'Free dispatch (optimal)',
  fcr:   'FCR — Frequency Containment Reserve',
  afrr:  'aFRR — Automatic Frequency Restoration',
  mfrr:  'mFRR — Manual Frequency Restoration',
}

// ── MEF profile (regional character) ─────────────────────────────────────────

function buildMefProfile(region: FrenchRegion, slots: number) {
  const regionalBias: Record<string, number> = {
    'Auvergne-Rhône-Alpes':       0.75,
    'Bourgogne-Franche-Comté':    0.90,
    'Bretagne':                   1.20,
    'Centre-Val de Loire':        0.70,
    'Grand Est':                  0.75,
    'Hauts-de-France':            1.10,
    'Île-de-France':              1.30,
    'Normandie':                  0.65,
    'Nouvelle-Aquitaine':         1.05,
    'Occitanie':                  0.95,
    'Pays de la Loire':           1.10,
    "Provence-Alpes-Côte d'Azur": 1.00,
    'Corse':                      1.50,
  }
  const mult = regionalBias[region] ?? 1.0

  return Array.from({ length: slots }, (_, i) => {
    const hour = (i / 4) % 24
    const morning = Math.exp(-0.5 * ((hour - 8.5) / 1.8) ** 2)
    const evening = Math.exp(-0.5 * ((hour - 19.5) / 1.5) ** 2)
    const base = 0.08 + 0.38 * Math.max(morning * 0.7, evening)
    const noise = (Math.random() - 0.5) * 0.015
    return Math.max(0.025, base * mult + noise)
  })
}

// ── Simulation engine ─────────────────────────────────────────────────────────

function runSimulation(config: AssetConfig): SimulationResult {
  const { capacityMwh, powerMw, rtePercent, region } = config
  const rte = rtePercent / 100
  const slots = 96

  const mefProfile = buildMefProfile(region, slots)
  const sorted = [...mefProfile].sort((a, b) => a - b)
  const greenInThreshold  = sorted[Math.floor(slots * 0.40)]
  const greenOutThreshold = sorted[Math.floor(slots * 0.70)]

  // Approach B: freeze counterfactual BEFORE dispatch
  const baselineLoad = powerMw * 0.5
  const baselineEmissions = mefProfile.map(m => baselineLoad * m * 0.25)

  let soc = capacityMwh * 0.30
  let greenIn = 0, greenOut = 0
  const dispatch: DispatchSlot[] = []
  const actualEmissions: number[] = []

  for (let i = 0; i < slots; i++) {
    const m = mefProfile[i]
    const hour = (i / 4)
    let p = 0
    let action: 'charge' | 'discharge' | 'idle' = 'idle'

    if (m <= greenInThreshold && soc < capacityMwh * 0.95) {
      p = Math.min(powerMw, capacityMwh * 0.95 - soc)
      soc += p * 0.25
      greenIn += p * 0.25
      action = 'charge'
    } else if (m >= greenOutThreshold && soc > capacityMwh * 0.10) {
      p = Math.min(powerMw, soc - capacityMwh * 0.10)
      soc -= p * 0.25
      greenOut += p * rte * 0.25
      action = 'discharge'
    }

    let actualE = baselineLoad * m * 0.25
    if (action === 'discharge') actualE -= p * rte * m * 0.25
    if (action === 'charge')    actualE += p * m * (1 - rte) * 0.25
    actualEmissions.push(Math.max(0, actualE))

    const co2Impact = action === 'charge'
      ? p * m * (1 - rte) * 0.25
      : action === 'discharge'
      ? -p * rte * m * 0.25
      : 0

    dispatch.push({ hour, mef: m, action, powerMw: p, socPct: (soc / capacityMwh) * 100, co2Impact })
  }

  const netCo2   = baselineEmissions.reduce((a, b) => a + b, 0) - actualEmissions.reduce((a, b) => a + b, 0)
  const gigoRatio = greenIn > 0 ? greenOut / greenIn : 0
  const avgMef    = mefProfile.reduce((a, b) => a + b, 0) / mefProfile.length

  const hash     = Math.random().toString(36).slice(2, 10).toUpperCase()
  const certDate = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })

  return {
    netCo2, greenIn, greenOut, gigoRatio,
    dispatch, baselineEmissions, actualEmissions, mefProfile,
    certId: `PV-2026-${String(new Date().getMonth() + 1).padStart(2, '0')}-${hash}`,
    certDate, avgMef,
    isSimulated: true,
    region, capacityMwh, powerMw, rtePercent,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, green }: {
  label: string; value: string; unit?: string; green?: boolean
}) {
  return (
    <div className="metric-card">
      <div className="section-label mb-2">{label}</div>
      <div className={`font-mono text-2xl font-medium tabular-nums ${green ? 'text-pv-green' : 'text-zinc-100'}`}>
        {value}
      </div>
      {unit && <div className="text-2xs text-zinc-500 mt-1 font-mono">{unit}</div>}
    </div>
  )
}

function SliderField({ label, value, min, max, step, unit, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number
  unit: string; onChange: (v: number) => void; hint?: string
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <label className="text-xs text-zinc-400">{label}</label>
        <span className="font-mono text-sm text-zinc-200 tabular-nums">{value} {unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-surface-border-mid rounded appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-pv-green [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-base"
      />
      {hint && <div className="text-2xs text-zinc-600 mt-1">{hint}</div>}
    </div>
  )
}

function DispatchBadge({ action }: { action: 'charge' | 'discharge' | 'idle' }) {
  const styles = {
    charge:    'bg-pv-green/10 text-pv-green border border-pv-green/20',
    discharge: 'bg-pv-amber/10 text-pv-amber border border-pv-amber/20',
    idle:      'bg-surface-overlay text-zinc-500 border border-surface-border',
  }
  return <span className={`badge ${styles[action]}`}>{action}</span>
}

// ── Main component ────────────────────────────────────────────────────────────

export function Demo() {
  const [config, setConfig]       = useState<AssetConfig>(DEFAULTS)
  const [result, setResult]       = useState<SimulationResult | null>(null)
  const [running, setRunning]     = useState(false)
  const [activeTab, setActiveTab] = useState<'dispatch' | 'methodology' | 'certificate'>('dispatch')
  const chartRef    = useRef<HTMLCanvasElement>(null)
  const baselineRef = useRef<HTMLCanvasElement>(null)
  const chartInstances = useRef<unknown[]>([])

  const set = (k: keyof AssetConfig) => (v: unknown) =>
    setConfig(prev => ({ ...prev, [k]: v }))

  async function handleRun() {
    setRunning(true)
    await new Promise(r => setTimeout(r, 600))
    setResult(runSimulation(config))
    setActiveTab('dispatch')
    setRunning(false)
  }

  useEffect(() => {
    if (!result || activeTab !== 'dispatch') return
    chartInstances.current.forEach((c: unknown) => (c as { destroy: () => void }).destroy?.())
    chartInstances.current = []

    const Chart = (window as unknown as Record<string, unknown>).Chart as {
      new (canvas: HTMLCanvasElement, config: unknown): { destroy: () => void }
    }
    if (!Chart) return

    const labels = result.dispatch
      .filter((_, i) => i % 4 === 0)
      .map(d => `${String(Math.floor(d.hour)).padStart(2, '0')}:00`)

    const downsample = (arr: number[], step = 4) => arr.filter((_, i) => i % step === 0)

    if (chartRef.current) {
      chartInstances.current.push(new Chart(chartRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Charge (MW)',    data: downsample(result.dispatch.map(d => d.action === 'charge'    ? d.powerMw : 0)), backgroundColor: '#1D9E7566', yAxisID: 'y' },
            { label: 'Discharge (MW)', data: downsample(result.dispatch.map(d => d.action === 'discharge' ? -d.powerMw : 0)), backgroundColor: '#BA751766', yAxisID: 'y' },
            { label: 'MEF',            data: downsample(result.mefProfile).map(v => +v.toFixed(3)),
              type: 'line', borderColor: '#378ADD', backgroundColor: '#378ADD15',
              fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y2' },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x:  { ticks: { font: { family: 'DM Mono', size: 10 }, color: '#71717a', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: '#25252240' } },
            y:  { position: 'left',  ticks: { font: { family: 'DM Mono', size: 10 }, color: '#71717a' }, grid: { color: '#25252240' } },
            y2: { position: 'right', ticks: { font: { family: 'DM Mono', size: 10 }, color: '#71717a' }, grid: { drawOnChartArea: false } },
          },
        },
      }))
    }

    if (baselineRef.current) {
      chartInstances.current.push(new Chart(baselineRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Baseline', data: downsample(result.baselineEmissions).map(v => +v.toFixed(4)), borderColor: '#E24B4A', backgroundColor: '#E24B4A18', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
            { label: 'Actual',   data: downsample(result.actualEmissions).map(v => +v.toFixed(4)),   borderColor: '#1D9E75', backgroundColor: '#1D9E7518', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { font: { family: 'DM Mono', size: 10 }, color: '#71717a', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: '#25252240' } },
            y: { ticks: { font: { family: 'DM Mono', size: 10 }, color: '#71717a' }, grid: { color: '#25252240' } },
          },
        },
      }))
    }
  }, [result, activeTab])

  const tabs = [
    { key: 'dispatch',    label: 'Dispatch simulation' },
    { key: 'methodology', label: 'Methodology' },
    { key: 'certificate', label: 'Certificate output' },
  ] as const

  return (
    <section id="demo" className="px-6 max-w-6xl mx-auto pb-24">
      <div className="mb-10">
        <div className="section-label mb-3">Interactive demo</div>
        <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
          Configure a BESS asset and run a 24-hour simulation. Sensible defaults are
          pre-filled — you can run immediately or adjust any field for your specific asset.
          Live RTE eCO₂mix data replaces the simulated profile in production.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

        {/* ── Inputs ─────────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Region */}
          <div className="bg-surface-raised border border-surface-border rounded-xl p-5">
            <div className="section-label mb-4">Grid region</div>
            <select
              value={config.region}
              onChange={e => set('region')(e.target.value as FrenchRegion)}
              className="pv-select w-full text-sm"
            >
              {FRENCH_REGIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <p className="text-2xs text-zinc-600 mt-2">
              Each region has a distinct carbon profile based on its local generation mix.
            </p>
          </div>

          {/* Asset */}
          <div className="bg-surface-raised border border-surface-border rounded-xl p-5 space-y-5">
            <div className="section-label">BESS asset</div>
            <SliderField
              label="Capacity" value={config.capacityMwh} min={1} max={100} step={1}
              unit="MWh" onChange={set('capacityMwh')}
              hint="Total energy storage capacity"
            />
            <SliderField
              label="Power rating" value={config.powerMw} min={1} max={50} step={1}
              unit="MW" onChange={set('powerMw')}
              hint="Maximum charge / discharge rate"
            />
            <SliderField
              label="Round-trip efficiency" value={config.rtePercent} min={70} max={99} step={1}
              unit="%" onChange={set('rtePercent')}
              hint="Typical Li-ion BESS: 85–95%"
            />
          </div>

          {/* Contract type */}
          <div className="bg-surface-raised border border-surface-border rounded-xl p-5">
            <div className="section-label mb-4">Flexibility contract</div>
            <select
              value={config.contractType}
              onChange={e => set('contractType')(e.target.value)}
              className="pv-select w-full text-sm"
            >
              {Object.entries(CONTRACT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <p className="text-2xs text-zinc-600 mt-2">
              Dispatch windows are auto-optimised from the regional MEF profile.
              FCR / aFRR / mFRR constraints applied in GIGO v2.
            </p>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={running}
            className="btn-primary w-full justify-center py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Running simulation…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>
                Run 24h simulation
              </>
            )}
          </button>

          {result?.isSimulated && (
            <p className="text-2xs text-zinc-600 text-center">
              Simulated MEF profile — regional character applied.
              Live RTE data active in production.
            </p>
          )}
        </div>

        {/* ── Results ────────────────────────────────────────────────────── */}
        <div>
          {!result ? (
            <div className="bg-surface-raised border border-surface-border rounded-xl h-full min-h-[400px] flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-surface-overlay border border-surface-border flex items-center justify-center mx-auto mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.5"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
                </div>
                <p className="text-sm text-zinc-500">Configure your asset and run a simulation</p>
                <p className="text-2xs text-zinc-600 mt-1">Default values are pre-filled — just press Run</p>
              </div>
            </div>
          ) : (
            <div>
              {/* Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <MetricCard label="Net CO₂ avoided"  value={result.netCo2.toFixed(2)}    unit="tCO₂e / day"          green={result.netCo2 > 0} />
                <MetricCard label="Green-In"         value={result.greenIn.toFixed(1)}    unit="MWh charged" />
                <MetricCard label="Green-Out"        value={result.greenOut.toFixed(1)}   unit="MWh displaced" />
                <MetricCard label="GIGO ratio"       value={result.gigoRatio.toFixed(2)}  unit="Green-Out / Green-In"  green={result.gigoRatio > 0.8} />
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-surface-border mb-5 overflow-x-auto">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`pv-tab ${activeTab === t.key ? 'active' : ''}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Dispatch ─────────────────────────────────────────── */}
              {activeTab === 'dispatch' && (
                <div className="space-y-4">
                  <div className="chart-container">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <div className="text-sm font-medium text-zinc-200">Dispatch & MEF profile</div>
                      <div className="flex items-center gap-4 flex-wrap">
                        {[
                          { color: '#1D9E75', label: 'Charge (MW)' },
                          { color: '#BA7517', label: 'Discharge (MW)' },
                          { color: '#378ADD', label: 'MEF (tCO₂/MWh)' },
                        ].map(l => (
                          <span key={l.label} className="flex items-center gap-1.5 text-2xs text-zinc-500">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: l.color }} />
                            {l.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ position: 'relative', height: 200 }}>
                      <canvas ref={chartRef} />
                    </div>
                  </div>

                  <div className="chart-container">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <div className="text-sm font-medium text-zinc-200">Counterfactual baseline vs actual emissions</div>
                      <div className="flex items-center gap-4">
                        {[
                          { color: '#E24B4A', label: 'Baseline (frozen)' },
                          { color: '#1D9E75', label: 'Actual (with BESS)' },
                        ].map(l => (
                          <span key={l.label} className="flex items-center gap-1.5 text-2xs text-zinc-500">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: l.color }} />
                            {l.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ position: 'relative', height: 160 }}>
                      <canvas ref={baselineRef} />
                    </div>
                  </div>

                  {/* Dispatch log */}
                  <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-surface-border">
                      <span className="section-label">Dispatch log — active slots</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-surface-border">
                            {['Time', 'MEF (tCO₂/MWh)', 'Decision', 'Power (MW)', 'SoC (%)', 'CO₂ impact (t)'].map(h => (
                              <th key={h} className="text-left px-4 py-2.5 text-zinc-500 font-normal whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.dispatch
                            .filter(d => d.action !== 'idle')
                            .slice(0, 20)
                            .map((d, i) => (
                              <tr key={i} className="border-b border-surface-border/50 hover:bg-surface-overlay/50 transition-colors">
                                <td className="px-4 py-2 text-zinc-300">
                                  {String(Math.floor(d.hour)).padStart(2, '0')}:{d.hour % 1 >= 0.5 ? '30' : '00'}
                                </td>
                                <td className="px-4 py-2 text-zinc-300">{d.mef.toFixed(3)}</td>
                                <td className="px-4 py-2"><DispatchBadge action={d.action} /></td>
                                <td className="px-4 py-2 text-zinc-300">{d.powerMw.toFixed(1)}</td>
                                <td className="px-4 py-2 text-zinc-300">{d.socPct.toFixed(0)}%</td>
                                <td className={`px-4 py-2 tabular-nums ${d.co2Impact < 0 ? 'text-pv-green' : d.co2Impact > 0 ? 'text-pv-amber' : 'text-zinc-500'}`}>
                                  {d.co2Impact < 0 ? '' : '+'}{d.co2Impact.toFixed(4)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab: Methodology ──────────────────────────────────────── */}
              {activeTab === 'methodology' && (
                <div className="space-y-4" id="methodology">

                  <div className="bg-surface-raised border border-surface-border rounded-xl p-6">
                    <div className="section-label mb-3">GIGO v1 — what it certifies</div>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      PicoVera GIGO v1 certifies the net CO₂ reduction from grid flexibility assets
                      using a marginal emissions approach, aligned with{' '}
                      <span className="text-zinc-300">GHG Protocol Scope 2 Guidance</span> and{' '}
                      <span className="text-zinc-300">ISO 14064-3</span>. It quantifies the difference
                      between what would have been emitted without the asset (the counterfactual baseline)
                      and what was actually emitted under dispatch — using real regional grid data
                      sourced from RTE eCO₂mix.
                    </p>
                  </div>

                  <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-surface-border">
                      <span className="section-label">Standards alignment</span>
                    </div>
                    <div className="divide-y divide-surface-border">
                      {[
                        { standard: 'GHG Protocol Scope 2 Guidance', role: 'Marginal emissions approach — primary accounting framework' },
                        { standard: 'ISO 14064-3',                    role: 'Third-party verification standard' },
                        { standard: 'CSRD ESRS E1',                   role: 'Disclosure framework — Scope 2 reporting' },
                        { standard: 'ADEME Base Carbone',             role: 'Emissions reference data source' },
                        { standard: 'IPCC AR6',                       role: 'Lifecycle emissions reference' },
                        { standard: 'RTE eCO₂mix · ODRÉ',            role: 'Real-time regional grid data — France' },
                      ].map(({ standard, role }) => (
                        <div key={standard} className="flex justify-between items-start px-5 py-3">
                          <div className="text-sm text-zinc-300 font-medium">{standard}</div>
                          <div className="text-xs text-zinc-500 text-right ml-6 max-w-xs">{role}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-surface-raised border border-surface-border rounded-xl p-5">
                    <div className="section-label mb-3">Third-party verification</div>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      The GIGO v1 methodology is designed for verification by accredited third-party
                      bodies. PicoVera is engaging{' '}
                      <span className="text-zinc-300">Bureau Veritas</span> and{' '}
                      <span className="text-zinc-300">DNV</span> for methodology review.
                      Detailed methodology documentation is available to verifiers and pilot clients
                      under NDA.
                    </p>
                  </div>

                  <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-surface-border">
                      <span className="section-label">Methodology roadmap</span>
                    </div>
                    <div className="divide-y divide-surface-border">
                      <div className="px-5 py-4 flex items-start gap-4">
                        <span className="badge badge-green mt-0.5 flex-shrink-0">Current</span>
                        <div>
                          <div className="text-sm font-medium text-zinc-200 mb-1">GIGO v1 — regional marginal emissions</div>
                          <p className="text-xs text-zinc-500 leading-relaxed">
                            Real-time regional generation mix data from RTE eCO₂mix. Marginal emissions
                            certified at regional level across all 13 French administrative regions.
                            Sufficient for CSRD Wave 1 disclosure obligations.
                          </p>
                        </div>
                      </div>
                      <div className="px-5 py-4 flex items-start gap-4">
                        <span className="badge badge-neutral mt-0.5 flex-shrink-0">In development</span>
                        <div>
                          <div className="text-sm font-medium text-zinc-400 mb-1">GIGO v2 — unit-level counterfactual</div>
                          <p className="text-xs text-zinc-500 leading-relaxed">
                            Per-unit dispatch data from RTE Actual Generation API. Direct observation
                            of the marginal generating unit at each timestamp. Higher precision,
                            sub-regional granularity. Target: available to pilot clients in 2026.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* ── Tab: Certificate ──────────────────────────────────────── */}
              {activeTab === 'certificate' && (
                <div className="space-y-4">
                  <div className="bg-surface-raised border border-surface-border rounded-xl p-6">
                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <div className="font-display text-lg text-zinc-100 mb-1">
                          PicoVera Certification Record
                        </div>
                        <div className="font-mono text-xs text-zinc-500">{result.certId}</div>
                      </div>
                      {/* Badge based on result only — not internal methodology flags */}
                      <span className={`badge ${result.netCo2 > 0 ? 'badge-green' : 'badge-red'}`}>
                        {result.netCo2 > 0 ? 'CSRD eligible' : 'Net negative — review dispatch'}
                      </span>
                    </div>

                    <div className="border-t border-surface-border pt-5">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                        {[
                          { label: 'Asset type',        value: 'BESS — grid-connected' },
                          { label: 'Region',            value: result.region },
                          { label: 'Certification date',value: result.certDate },
                          { label: 'Net CO₂ avoided',   value: `${result.netCo2.toFixed(3)} tCO₂e`, highlight: true },
                          { label: 'GIGO ratio',        value: result.gigoRatio.toFixed(3) },
                          { label: 'Average MEF',       value: `${result.avgMef.toFixed(3)} tCO₂/MWh` },
                          { label: 'Methodology',       value: 'GIGO v1' },
                          { label: 'Standard',          value: 'GHG Protocol · ISO 14064' },
                          { label: 'Verification path', value: 'Bureau Veritas · DNV' },
                        ].map(({ label, value, highlight }) => (
                          <div key={label}>
                            <div className="section-label mb-1">{label}</div>
                            <div className={`text-sm font-medium ${highlight ? 'text-pv-green font-mono' : 'text-zinc-300'}`}>
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Certified quantities — what and against what standard, not how */}
                  <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-surface-border">
                      <span className="section-label">Certified quantities</span>
                    </div>
                    <div className="divide-y divide-surface-border">
                      {[
                        { item: 'Green-In energy charged',    value: `${result.greenIn.toFixed(2)} MWh`,  basis: 'GHG Protocol Scope 2 — marginal approach' },
                        { item: 'Green-Out energy delivered', value: `${result.greenOut.toFixed(2)} MWh`, basis: 'GHG Protocol Scope 2 — marginal approach' },
                        { item: 'Round-trip efficiency',      value: `${result.rtePercent.toFixed(0)}%`,  basis: 'Asset specification' },
                        { item: 'Marginal emissions data',    value: 'RTE eCO₂mix · ODRÉ',               basis: 'Real-time regional grid data — France' },
                        { item: 'Counterfactual method',      value: 'GIGO v1',                          basis: 'ISO 14064-3 compliant — auditable baseline' },
                        { item: 'Net CO₂ reduction',          value: `${result.netCo2.toFixed(3)} tCO₂e`, basis: 'CSRD ESRS E1 Scope 2 disclosure', highlight: true },
                      ].map(({ item, value, basis, highlight }) => (
                        <div key={item} className="flex justify-between items-start px-5 py-3 border-b border-surface-border last:border-0">
                          <div>
                            <div className={`text-sm ${highlight ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}>{item}</div>
                            <div className="text-2xs text-zinc-600 mt-0.5">{basis}</div>
                          </div>
                          <div className={`font-mono text-sm tabular-nums ml-6 text-right flex-shrink-0 ${highlight ? 'text-pv-green' : 'text-zinc-400'}`}>
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button className="btn-primary flex-1 justify-center">
                      Export CSRD report (PDF)
                    </button>
                    <button className="btn-ghost" onClick={() => window.print()}>
                      Print
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" async />
    </section>
  )
}
