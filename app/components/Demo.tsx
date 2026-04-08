'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PicoVera GIGO Demo — rebuilt around the three-pillar methodology
//
// Mode A: Annual Certification — uses annual volumes + average grid intensity
// Mode B: Event-level Certification — uses timestamped events + real RTE MEF
//
// Three pillars:
//   1. Production       — battery metered output (MWh charged / discharged)
//   2. Bilan du réseau  — grid carbon intensity at relevant times (gCO₂/kWh)
//   3. Bilan de la batterie — carbon cost of charging (intensity × charge volume)
//
// Delta = (Discharge MWh × avg intensity OUT) − (Charge MWh × avg intensity IN)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type Mode = 'annual' | 'event'
type ChargingPeriod = 'full-year' | 'night' | 'day' | 'off-peak'
type ContractType = 'free' | 'fcr' | 'afrr' | 'mfrr'
type Region = string

interface AnnualInputs {
  region: Region
  chargeMwh: number
  dischargeMwh: number
  rtePercent: number
  chargingPeriod: ChargingPeriod
  contractType: ContractType
  // Optional refinements
  capacityMwh: number
  powerMw: number
}

interface DispatchEvent {
  id: string
  chargeStart: string   // ISO datetime
  chargeEnd: string
  chargeMwh: number
  dischargeStart: string
  dischargeEnd: string
  dischargeMwh: number
}

interface EventInputs {
  region: Region
  rtePercent: number
  events: DispatchEvent[]
}

interface Pillar1 {
  totalChargeMwh: number
  totalDischargeMwh: number
  roundTripEfficiency: number
  energyLossMwh: number
}

interface Pillar2 {
  avgIntensityOut: number   // tCO₂/MWh — grid intensity during discharge
  source: string
  note: string
}

interface Pillar3 {
  avgIntensityIn: number    // tCO₂/MWh — grid intensity during charge
  totalChargeCo2: number   // tCO₂ — carbon cost of charging
  source: string
}

interface DeltaResult {
  baselineEmissions: number  // tCO₂ — what would have been emitted without battery
  actualChargeCost: number   // tCO₂ — carbon cost of charging
  netCo2Avoided: number      // tCO₂ — the certified number
  csrdEligible: boolean
  certId: string
  certDate: string
  mode: Mode
}

interface EventResult extends DeltaResult {
  eventBreakdown: Array<{
    id: string
    chargeMwh: number
    dischargeMwh: number
    intensityIn: number
    intensityOut: number
    netCo2: number
  }>
}

// ── Constants ────────────────────────────────────────────────────────────────

const FRENCH_REGIONS: Region[] = [
  'Île-de-France', 'Auvergne-Rhône-Alpes', 'Hauts-de-France',
  'Grand Est', 'Bretagne', 'Normandie', 'Pays de la Loire',
  'Nouvelle-Aquitaine', 'Occitanie', "Provence-Alpes-Côte d'Azur",
  'Bourgogne-Franche-Comté', 'Centre-Val de Loire', 'Corse',
]

// Annual average grid intensity by region (tCO₂/MWh)
// Source: RTE eCO₂mix annual averages — France 2024
// France is a low-carbon grid (~0.035–0.060 tCO₂/MWh annual average)
const REGIONAL_ANNUAL_INTENSITY: Record<string, number> = {
  'Île-de-France':              0.052,
  'Auvergne-Rhône-Alpes':       0.038,
  'Hauts-de-France':            0.068,
  'Grand Est':                  0.041,
  'Bretagne':                   0.072,
  'Normandie':                  0.029,
  'Pays de la Loire':           0.065,
  'Nouvelle-Aquitaine':         0.058,
  'Occitanie':                  0.048,
  "Provence-Alpes-Côte d'Azur": 0.051,
  'Bourgogne-Franche-Comté':    0.044,
  'Centre-Val de Loire':        0.033,
  'Corse':                      0.098,
}

// Period-adjusted intensity multipliers
// Batteries charged at night avoid peak-hour emissions → lower charge intensity
// Batteries discharged at peak → higher avoided emissions
const PERIOD_CHARGE_MULTIPLIER: Record<ChargingPeriod, number> = {
  'full-year': 1.00,
  'night':     0.72,   // Night = more nuclear, less gas → cleaner charging
  'day':       1.15,   // Day = more solar but also more demand
  'off-peak':  0.85,
}

const PERIOD_DISCHARGE_MULTIPLIER: Record<ChargingPeriod, number> = {
  'full-year': 1.00,
  'night':     0.90,
  'day':       1.25,   // Peak discharge replaces more expensive, dirtier sources
  'off-peak':  1.10,
}

const PERIOD_LABELS: Record<ChargingPeriod, string> = {
  'full-year': 'Throughout the year (no preference)',
  'night':     'Mostly at night (off-peak hours)',
  'day':       'Mostly during the day (peak hours)',
  'off-peak':  'Off-peak periods (shoulder hours)',
}

const CONTRACT_LABELS: Record<ContractType, string> = {
  free:  'Free dispatch — carbon-optimised',
  fcr:   'FCR — Frequency Containment Reserve',
  afrr:  'aFRR — Automatic Frequency Restoration',
  mfrr:  'mFRR — Manual Frequency Restoration',
}

// ── Annual calculation engine ─────────────────────────────────────────────────

function computeAnnual(inputs: AnnualInputs): {
  pillar1: Pillar1
  pillar2: Pillar2
  pillar3: Pillar3
  delta: DeltaResult
} {
  const baseIntensity = REGIONAL_ANNUAL_INTENSITY[inputs.region] ?? 0.050
  const rte = inputs.rtePercent / 100

  const intensityIn  = baseIntensity * PERIOD_CHARGE_MULTIPLIER[inputs.chargingPeriod]
  const intensityOut = baseIntensity * PERIOD_DISCHARGE_MULTIPLIER[inputs.chargingPeriod]

  const pillar1: Pillar1 = {
    totalChargeMwh:     inputs.chargeMwh,
    totalDischargeMwh:  inputs.dischargeMwh,
    roundTripEfficiency: rte,
    energyLossMwh:      inputs.chargeMwh - inputs.dischargeMwh,
  }

  const pillar2: Pillar2 = {
    avgIntensityOut: intensityOut,
    source: 'RTE eCO₂mix annual average — adjusted for discharge period',
    note: inputs.chargingPeriod === 'full-year'
      ? 'Full-year average applied'
      : `Period adjustment applied: ${PERIOD_LABELS[inputs.chargingPeriod]}`,
  }

  const pillar3: Pillar3 = {
    avgIntensityIn:   intensityIn,
    totalChargeCo2:   inputs.chargeMwh * intensityIn,
    source: 'RTE eCO₂mix annual average — adjusted for charging period',
  }

  const baselineEmissions = inputs.dischargeMwh * intensityOut
  const actualChargeCost  = inputs.chargeMwh * intensityIn
  const netCo2Avoided     = baselineEmissions - actualChargeCost

  const hash = Math.random().toString(36).slice(2, 10).toUpperCase()
  const certDate = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })

  return {
    pillar1,
    pillar2,
    pillar3,
    delta: {
      baselineEmissions,
      actualChargeCost,
      netCo2Avoided,
      csrdEligible: netCo2Avoided > 0,
      certId: `PV-ANN-${new Date().getFullYear()}-${hash}`,
      certDate,
      mode: 'annual',
    },
  }
}

// ── Event-level calculation engine ────────────────────────────────────────────
// NOTE: In production, intensityIn/Out per event come from real RTE API calls
// (authenticated Partner API, per-unit generation data at 5-min granularity).
// For now we simulate realistic per-event variation around the regional average
// to demonstrate the methodology. The structure is identical to what the real
// engine will produce — only the data source changes.

function computeEventLevel(inputs: EventInputs): {
  pillar1: Pillar1
  pillar2: Pillar2
  pillar3: Pillar3
  delta: EventResult
} {
  const baseIntensity = REGIONAL_ANNUAL_INTENSITY[inputs.region] ?? 0.050
  const rte = inputs.rtePercent / 100

  // Simulate realistic MEF variation per event
  // Peak hours (7-9h, 18-21h) → higher MEF; night/weekend → lower
  function getEventIntensity(isoTime: string, isCharge: boolean): number {
    const hour = new Date(isoTime).getHours()
    const isPeak = (hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 21)
    const isNight = hour >= 22 || hour <= 6
    let mult = 1.0
    if (isPeak)  mult = isCharge ? 1.30 : 1.45  // charging at peak = expensive; discharging at peak = high savings
    if (isNight) mult = isCharge ? 0.65 : 0.80
    const noise = 1 + (Math.random() - 0.5) * 0.10
    return Math.max(0.010, baseIntensity * mult * noise)
  }

  const eventBreakdown = inputs.events.map(ev => {
    const intensityIn  = getEventIntensity(ev.chargeStart, true)
    const intensityOut = getEventIntensity(ev.dischargeStart, false)
    const netCo2 = (ev.dischargeMwh * intensityOut) - (ev.chargeMwh * intensityIn)
    return { id: ev.id, chargeMwh: ev.chargeMwh, dischargeMwh: ev.dischargeMwh, intensityIn, intensityOut, netCo2 }
  })

  const totalCharge    = eventBreakdown.reduce((s, e) => s + e.chargeMwh, 0)
  const totalDischarge = eventBreakdown.reduce((s, e) => s + e.dischargeMwh, 0)
  const totalBaseline  = eventBreakdown.reduce((s, e) => s + e.dischargeMwh * e.intensityOut, 0)
  const totalChargeCo2 = eventBreakdown.reduce((s, e) => s + e.chargeMwh * e.intensityIn, 0)
  const netCo2Avoided  = totalBaseline - totalChargeCo2

  const avgIntensityOut = totalDischarge > 0 ? totalBaseline / totalDischarge : 0
  const avgIntensityIn  = totalCharge    > 0 ? totalChargeCo2 / totalCharge   : 0

  const pillar1: Pillar1 = {
    totalChargeMwh:      totalCharge,
    totalDischargeMwh:   totalDischarge,
    roundTripEfficiency: rte,
    energyLossMwh:       totalCharge - totalDischarge,
  }

  const pillar2: Pillar2 = {
    avgIntensityOut,
    source: 'RTE Actual Generation API — per-event MEF (simulated pending Partner API auth)',
    note: `Computed across ${inputs.events.length} discharge events. Production: authenticated RTE Partner API at 5-min granularity.`,
  }

  const pillar3: Pillar3 = {
    avgIntensityIn,
    totalChargeCo2,
    source: 'RTE Actual Generation API — per-event MEF (simulated pending Partner API auth)',
  }

  const hash = Math.random().toString(36).slice(2, 10).toUpperCase()
  const certDate = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })

  return {
    pillar1,
    pillar2,
    pillar3,
    delta: {
      baselineEmissions: totalBaseline,
      actualChargeCost:  totalChargeCo2,
      netCo2Avoided,
      csrdEligible: netCo2Avoided > 0,
      certId: `PV-EVT-${new Date().getFullYear()}-${hash}`,
      certDate,
      mode: 'event',
      eventBreakdown,
    },
  }
}

// ── Default sample events ─────────────────────────────────────────────────────

function buildSampleEvents(): DispatchEvent[] {
  const base = new Date('2025-03-15')
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i * 7)
    const chargeStart = new Date(d); chargeStart.setHours(2, 0)
    const chargeEnd   = new Date(d); chargeEnd.setHours(5, 0)
    const dischargeStart = new Date(d); dischargeStart.setHours(18, 30)
    const dischargeEnd   = new Date(d); dischargeEnd.setHours(21, 0)
    const chargeMwh    = 8 + Math.random() * 4
    const dischargeMwh = chargeMwh * (0.88 + Math.random() * 0.06)
    return {
      id: `EVT-${String(i + 1).padStart(3, '0')}`,
      chargeStart:    chargeStart.toISOString(),
      chargeEnd:      chargeEnd.toISOString(),
      chargeMwh:      +chargeMwh.toFixed(2),
      dischargeStart: dischargeStart.toISOString(),
      dischargeEnd:   dischargeEnd.toISOString(),
      dischargeMwh:   +dischargeMwh.toFixed(2),
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) { return n.toFixed(decimals) }
function fmtIntensity(n: number) { return (n * 1000).toFixed(1) } // tCO₂/MWh → gCO₂/kWh

function formatDT(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Main component ────────────────────────────────────────────────────────────

export function Demo() {
  const [mode, setMode] = useState<Mode>('annual')

  // Annual mode state
  const [annualInputs, setAnnualInputs] = useState<AnnualInputs>({
    region: 'Île-de-France',
    chargeMwh: 1200,
    dischargeMwh: 1080,
    rtePercent: 90,
    chargingPeriod: 'night',
    contractType: 'free',
    capacityMwh: 10,
    powerMw: 5,
  })

  // Event mode state
  const [eventInputs, setEventInputs] = useState<EventInputs>({
    region: 'Île-de-France',
    rtePercent: 90,
    events: buildSampleEvents(),
  })

  type AnnualResult = ReturnType<typeof computeAnnual>
  type EventLevelResult = ReturnType<typeof computeEventLevel>
  const [annualResult, setAnnualResult]   = useState<AnnualResult | null>(null)
  const [eventResult,  setEventResult]    = useState<EventLevelResult | null>(null)
  const [running, setRunning]             = useState(false)
  const [activeResultTab, setActiveResultTab] = useState<'pillars' | 'certificate'>('pillars')

  const setA = (k: keyof AnnualInputs) => (v: AnnualInputs[typeof k]) =>
    setAnnualInputs(prev => ({ ...prev, [k]: v }))

  const setE = (k: keyof EventInputs) => (v: EventInputs[typeof k]) =>
    setEventInputs(prev => ({ ...prev, [k]: v }))

  async function handleRun() {
    setRunning(true)
    await new Promise(r => setTimeout(r, 700))
    if (mode === 'annual') {
      setAnnualResult(computeAnnual(annualInputs))
    } else {
      setEventResult(computeEventLevel(eventInputs))
    }
    setActiveResultTab('pillars')
    setRunning(false)
  }

  const result = mode === 'annual' ? annualResult : eventResult

  return (
    <section id="demo" style={{
      fontFamily: "'DM Mono', 'Fira Mono', monospace",
      background: '#0a0a0f',
      minHeight: '100vh',
      padding: '48px 24px',
      color: '#e4e4e7',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#1D9E75', textTransform: 'uppercase', marginBottom: 12 }}>
            PicoVera · GIGO Certification Engine
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 600, color: '#f4f4f5', margin: 0, letterSpacing: -0.5 }}>
            Emission Reduction Certification
          </h2>
          <p style={{ fontSize: 13, color: '#71717a', marginTop: 8, lineHeight: 1.6, maxWidth: 560 }}>
            Select a certification mode, configure your asset, and compute the certified CO₂ delta
            across three pillars: production, grid carbon intensity, and battery carbon accounting.
          </p>
        </div>

        {/* ── Mode toggle ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 32, border: '1px solid #27272a', borderRadius: 10, overflow: 'hidden', width: 'fit-content' }}>
          {([
            { key: 'annual', label: 'Annual certification', sub: 'Phase 1 — volumes & averages' },
            { key: 'event',  label: 'Event-level certification', sub: 'Phase 2 — timestamped dispatch' },
          ] as const).map(m => (
            <button key={m.key} onClick={() => setMode(m.key)} style={{
              padding: '14px 28px',
              background: mode === m.key ? '#1D9E75' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.2s',
              borderRight: m.key === 'annual' ? '1px solid #27272a' : 'none',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: mode === m.key ? '#fff' : '#a1a1aa', marginBottom: 2 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 11, color: mode === m.key ? 'rgba(255,255,255,0.7)' : '#52525b' }}>
                {m.sub}
              </div>
            </button>
          ))}
          <div style={{ padding: '14px 20px', borderLeft: '1px solid #27272a', display: 'flex', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#52525b', marginBottom: 2 }}>Phase 3</div>
              <div style={{ fontSize: 11, color: '#3f3f46', fontStyle: 'italic' }}>Forward-looking</div>
              <div style={{ fontSize: 10, color: '#3f3f46' }}>AI projections · roadmap</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>

          {/* ── Left: Inputs ───────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Region */}
            <InputCard title="Grid region">
              <Select
                value={mode === 'annual' ? annualInputs.region : eventInputs.region}
                onChange={v => mode === 'annual' ? setA('region')(v) : setE('region')(v)}
                options={FRENCH_REGIONS.map(r => ({ value: r, label: r }))}
              />
              <Hint>Used to derive annual average grid carbon intensity (tCO₂/MWh) from RTE eCO₂mix data.</Hint>
            </InputCard>

            {mode === 'annual' ? (
              <>
                {/* Annual volumes */}
                <InputCard title="Pillar 1 — Production (annual volumes)">
                  <FieldRow label="Total charged" unit="MWh/year">
                    <NumInput value={annualInputs.chargeMwh} onChange={v => setA('chargeMwh')(v)} min={1} max={100000} />
                  </FieldRow>
                  <FieldRow label="Total discharged" unit="MWh/year">
                    <NumInput value={annualInputs.dischargeMwh} onChange={v => setA('dischargeMwh')(v)} min={1} max={100000} />
                  </FieldRow>
                  <FieldRow label="Round-trip efficiency" unit="%">
                    <NumInput value={annualInputs.rtePercent} onChange={v => setA('rtePercent')(v)} min={70} max={99} step={0.1} />
                  </FieldRow>
                  <Hint>Provided by the battery operator from metered SCADA data.</Hint>
                </InputCard>

                {/* Refinements */}
                <InputCard title="Pillar 2 & 3 — Refine grid intensity">
                  <Label>When does the battery mainly charge?</Label>
                  <Select
                    value={annualInputs.chargingPeriod}
                    onChange={v => setA('chargingPeriod')(v as ChargingPeriod)}
                    options={Object.entries(PERIOD_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                  />
                  <Hint>Charging at night → lower intensity IN. Discharging at peak → higher intensity OUT → larger delta.</Hint>
                  <div style={{ marginTop: 12 }}>
                    <Label>Flexibility contract</Label>
                    <Select
                      value={annualInputs.contractType}
                      onChange={v => setA('contractType')(v as ContractType)}
                      options={Object.entries(CONTRACT_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                    />
                  </div>
                </InputCard>

                {/* Optional */}
                <InputCard title="Optional — asset specs">
                  <FieldRow label="Capacity" unit="MWh">
                    <NumInput value={annualInputs.capacityMwh} onChange={v => setA('capacityMwh')(v)} min={1} max={1000} />
                  </FieldRow>
                  <FieldRow label="Power rating" unit="MW">
                    <NumInput value={annualInputs.powerMw} onChange={v => setA('powerMw')(v)} min={0.5} max={500} step={0.5} />
                  </FieldRow>
                  <Hint>Not required for Phase 1 calculation — used for asset registration record only.</Hint>
                </InputCard>
              </>
            ) : (
              <>
                {/* Event mode inputs */}
                <InputCard title="Asset settings">
                  <FieldRow label="Round-trip efficiency" unit="%">
                    <NumInput value={eventInputs.rtePercent} onChange={v => setE('rtePercent')(v)} min={70} max={99} step={0.1} />
                  </FieldRow>
                </InputCard>

                <InputCard title="Pillar 1 — Dispatch events">
                  <div style={{ fontSize: 12, color: '#71717a', marginBottom: 10, lineHeight: 1.5 }}>
                    {eventInputs.events.length} events loaded · {fmt(eventInputs.events.reduce((s, e) => s + e.chargeMwh, 0), 1)} MWh charged · {fmt(eventInputs.events.reduce((s, e) => s + e.dischargeMwh, 0), 1)} MWh discharged
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 11, color: '#71717a' }}>
                    {eventInputs.events.map(ev => (
                      <div key={ev.id} style={{ padding: '6px 0', borderBottom: '1px solid #18181b' }}>
                        <span style={{ color: '#a1a1aa', marginRight: 8 }}>{ev.id}</span>
                        <span style={{ color: '#1D9E75' }}>↓ {ev.chargeMwh} MWh</span>
                        <span style={{ margin: '0 6px', color: '#3f3f46' }}>·</span>
                        <span style={{ color: '#BA7517' }}>↑ {ev.dischargeMwh} MWh</span>
                      </div>
                    ))}
                  </div>
                  <Hint>
                    In production: operator uploads metered SCADA export or connects via API.
                    Per-event grid intensity fetched from RTE Partner API (authenticated).
                  </Hint>
                </InputCard>

                <div style={{
                  padding: '12px 14px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#52525b',
                  lineHeight: 1.6,
                }}>
                  <span style={{ color: '#3f6b8a', fontWeight: 600 }}>Note — RTE Partner API</span><br />
                  Phase 2 precision requires authenticated access to RTE's Partner API for per-unit generation data at 5-min granularity.
                  Grid intensity per event is <span style={{ color: '#71717a' }}>simulated</span> in this demo pending authentication setup.
                  Methodology structure is identical to production.
                </div>
              </>
            )}

            <button onClick={handleRun} disabled={running} style={{
              padding: '14px',
              background: running ? '#14532d' : '#1D9E75',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: running ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              letterSpacing: 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background 0.2s',
            }}>
              {running ? '⟳ Computing...' : `▶ Compute ${mode === 'annual' ? 'annual' : 'event-level'} certification`}
            </button>
          </div>

          {/* ── Right: Results ─────────────────────────────────────────────── */}
          <div>
            {!result ? (
              <EmptyState mode={mode} />
            ) : (
              <div>
                {/* Result tabs */}
                <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid #27272a', paddingBottom: 0 }}>
                  {([
                    { key: 'pillars',     label: 'Three pillars · delta' },
                    { key: 'certificate', label: 'Certificate output' },
                  ] as const).map(t => (
                    <button key={t.key} onClick={() => setActiveResultTab(t.key)} style={{
                      padding: '8px 16px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: activeResultTab === t.key ? '2px solid #1D9E75' : '2px solid transparent',
                      color: activeResultTab === t.key ? '#1D9E75' : '#71717a',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      fontWeight: activeResultTab === t.key ? 600 : 400,
                      marginBottom: -1,
                      transition: 'all 0.15s',
                    }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {activeResultTab === 'pillars' && (
                  <PillarsView result={result} mode={mode} />
                )}

                {activeResultTab === 'certificate' && (
                  <CertificateView result={result} mode={mode} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Pillars view ──────────────────────────────────────────────────────────────

function PillarsView({ result, mode }: { result: ReturnType<typeof computeAnnual> | ReturnType<typeof computeEventLevel>, mode: Mode }) {
  const { pillar1, pillar2, pillar3, delta } = result

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Three pillars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

        {/* Pillar 1 */}
        <PillarCard
          number="1"
          title="Production"
          subtitle="Bilan de la batterie — volumes"
          color="#1D9E75"
        >
          <PillarMetric label="Total charged"    value={`${fmt(pillar1.totalChargeMwh)} MWh`} />
          <PillarMetric label="Total discharged" value={`${fmt(pillar1.totalDischargeMwh)} MWh`} />
          <PillarMetric label="Energy lost"      value={`${fmt(pillar1.energyLossMwh)} MWh`} dim />
          <PillarMetric label="Round-trip eff."  value={`${(pillar1.roundTripEfficiency * 100).toFixed(0)}%`} dim />
          <div style={{ marginTop: 10, fontSize: 10, color: '#3f3f46', lineHeight: 1.5 }}>
            Source: operator metered data (SCADA)
          </div>
        </PillarCard>

        {/* Pillar 2 */}
        <PillarCard
          number="2"
          title="Bilan du réseau"
          subtitle="Grid carbon intensity — discharge"
          color="#378ADD"
        >
          <PillarMetric
            label="Avg intensity (discharge)"
            value={`${fmtIntensity(pillar2.avgIntensityOut)} gCO₂/kWh`}
            highlight
          />
          <PillarMetric
            label="Baseline avoided"
            value={`${fmt(delta.baselineEmissions, 3)} tCO₂`}
          />
          <div style={{ marginTop: 10, fontSize: 10, color: '#3f3f46', lineHeight: 1.5 }}>
            {pillar2.source}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: '#3f3f46', fontStyle: 'italic', lineHeight: 1.5 }}>
            {pillar2.note}
          </div>
        </PillarCard>

        {/* Pillar 3 */}
        <PillarCard
          number="3"
          title="Bilan de la batterie"
          subtitle="Carbon cost of charging"
          color="#BA7517"
        >
          <PillarMetric
            label="Avg intensity (charge)"
            value={`${fmtIntensity(pillar3.avgIntensityIn)} gCO₂/kWh`}
            highlight
          />
          <PillarMetric
            label="Total charge CO₂ cost"
            value={`${fmt(pillar3.totalChargeCo2, 3)} tCO₂`}
          />
          <div style={{ marginTop: 10, fontSize: 10, color: '#3f3f46', lineHeight: 1.5 }}>
            {pillar3.source}
          </div>
        </PillarCard>
      </div>

      {/* Delta calculation — shown explicitly */}
      <div style={{
        background: '#0f1a14',
        border: '1px solid #1D9E75',
        borderRadius: 10,
        padding: '20px 24px',
      }}>
        <div style={{ fontSize: 11, color: '#1D9E75', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
          Delta — certified emission reduction
        </div>

        {/* Formula */}
        <div style={{
          background: '#0a0a0f',
          borderRadius: 8,
          padding: '14px 18px',
          fontFamily: 'monospace',
          fontSize: 13,
          color: '#a1a1aa',
          marginBottom: 20,
          lineHeight: 2,
        }}>
          <span style={{ color: '#1D9E75' }}>Δ CO₂ avoided</span>
          {' = '}
          <span style={{ color: '#378ADD' }}>({fmt(pillar1.totalDischargeMwh)} MWh × {fmtIntensity(pillar2.avgIntensityOut)} gCO₂/kWh)</span>
          {' − '}
          <span style={{ color: '#BA7517' }}>({fmt(pillar1.totalChargeMwh)} MWh × {fmtIntensity(pillar3.avgIntensityIn)} gCO₂/kWh)</span>
          <br />
          <span style={{ color: '#1D9E75' }}>Δ CO₂ avoided</span>
          {' = '}
          <span style={{ color: '#378ADD' }}>{fmt(delta.baselineEmissions, 3)} tCO₂</span>
          {' − '}
          <span style={{ color: '#BA7517' }}>{fmt(delta.actualChargeCost, 3)} tCO₂</span>
          {' = '}
          <span style={{ color: delta.netCo2Avoided > 0 ? '#1D9E75' : '#E24B4A', fontWeight: 700, fontSize: 15 }}>
            {fmt(delta.netCo2Avoided, 3)} tCO₂e
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={{ background: '#18181b', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: '#52525b', marginBottom: 4 }}>Baseline emissions (Pillar 2)</div>
            <div style={{ fontSize: 18, color: '#378ADD', fontWeight: 600 }}>{fmt(delta.baselineEmissions, 3)}</div>
            <div style={{ fontSize: 10, color: '#52525b' }}>tCO₂e — would have been emitted</div>
          </div>
          <div style={{ background: '#18181b', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: '#52525b', marginBottom: 4 }}>Charge carbon cost (Pillar 3)</div>
            <div style={{ fontSize: 18, color: '#BA7517', fontWeight: 600 }}>{fmt(delta.actualChargeCost, 3)}</div>
            <div style={{ fontSize: 10, color: '#52525b' }}>tCO₂e — cost of charging</div>
          </div>
          <div style={{ background: delta.netCo2Avoided > 0 ? '#0f1f17' : '#1f0f0f', borderRadius: 8, padding: '12px 14px', border: `1px solid ${delta.netCo2Avoided > 0 ? '#1D9E75' : '#E24B4A'}` }}>
            <div style={{ fontSize: 10, color: '#52525b', marginBottom: 4 }}>Net CO₂ avoided — certified</div>
            <div style={{ fontSize: 22, color: delta.netCo2Avoided > 0 ? '#1D9E75' : '#E24B4A', fontWeight: 700 }}>
              {fmt(delta.netCo2Avoided, 3)}
            </div>
            <div style={{ fontSize: 10, color: '#52525b' }}>tCO₂e · {delta.csrdEligible ? '✓ CSRD eligible' : '✗ review required'}</div>
          </div>
        </div>
      </div>

      {/* Event breakdown table (Phase 2 only) */}
      {mode === 'event' && 'eventBreakdown' in delta && (
        <div style={{ background: '#111114', border: '1px solid #27272a', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #27272a', fontSize: 11, color: '#52525b', letterSpacing: 2, textTransform: 'uppercase' }}>
            Event-level breakdown
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #27272a' }}>
                  {['Event', 'Charged (MWh)', 'Discharged (MWh)', 'Intensity IN (gCO₂/kWh)', 'Intensity OUT (gCO₂/kWh)', 'Net CO₂ (tCO₂e)'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#52525b', fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {delta.eventBreakdown.map((ev, i) => (
                  <tr key={ev.id} style={{ borderBottom: '1px solid #18181b', background: i % 2 === 0 ? 'transparent' : '#0f0f12' }}>
                    <td style={{ padding: '8px 12px', color: '#a1a1aa' }}>{ev.id}</td>
                    <td style={{ padding: '8px 12px', color: '#71717a' }}>{fmt(ev.chargeMwh)}</td>
                    <td style={{ padding: '8px 12px', color: '#71717a' }}>{fmt(ev.dischargeMwh)}</td>
                    <td style={{ padding: '8px 12px', color: '#BA7517' }}>{fmtIntensity(ev.intensityIn)}</td>
                    <td style={{ padding: '8px 12px', color: '#378ADD' }}>{fmtIntensity(ev.intensityOut)}</td>
                    <td style={{ padding: '8px 12px', color: ev.netCo2 > 0 ? '#1D9E75' : '#E24B4A', fontWeight: 600 }}>
                      {ev.netCo2 > 0 ? '+' : ''}{fmt(ev.netCo2, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Certificate view ──────────────────────────────────────────────────────────

function CertificateView({ result, mode }: { result: ReturnType<typeof computeAnnual> | ReturnType<typeof computeEventLevel>, mode: Mode }) {
  const { delta, pillar1, pillar2, pillar3 } = result

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#111114', border: '1px solid #27272a', borderRadius: 10, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5', marginBottom: 4 }}>
              PicoVera Certification Record
            </div>
            <div style={{ fontSize: 11, color: '#52525b' }}>{delta.certId}</div>
          </div>
          <div style={{
            padding: '4px 12px',
            background: delta.csrdEligible ? '#0f2a1a' : '#2a0f0f',
            border: `1px solid ${delta.csrdEligible ? '#1D9E75' : '#E24B4A'}`,
            borderRadius: 20,
            fontSize: 11,
            color: delta.csrdEligible ? '#1D9E75' : '#E24B4A',
            fontWeight: 600,
          }}>
            {delta.csrdEligible ? '✓ CSRD eligible' : '✗ Net negative — review'}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #27272a', paddingTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {[
            { label: 'Asset type',              value: 'BESS — grid-connected' },
            { label: 'Certification mode',       value: mode === 'annual' ? 'Phase 1 — Annual averages' : 'Phase 2 — Event-level' },
            { label: 'Certification date',       value: delta.certDate },
            { label: 'Pillar 1 — Charged',       value: `${fmt(pillar1.totalChargeMwh)} MWh` },
            { label: 'Pillar 1 — Discharged',    value: `${fmt(pillar1.totalDischargeMwh)} MWh` },
            { label: 'Pillar 1 — RTE',           value: `${(pillar1.roundTripEfficiency * 100).toFixed(0)}%` },
            { label: 'Pillar 2 — Intensity OUT', value: `${fmtIntensity(pillar2.avgIntensityOut)} gCO₂/kWh` },
            { label: 'Pillar 3 — Intensity IN',  value: `${fmtIntensity(pillar3.avgIntensityIn)} gCO₂/kWh` },
            { label: 'Net CO₂ avoided',          value: `${fmt(delta.netCo2Avoided, 3)} tCO₂e`, highlight: true },
            { label: 'Methodology',              value: mode === 'annual' ? 'GIGO v1 — Phase 1' : 'GIGO v2 — Phase 2' },
            { label: 'Standard',                 value: 'GHG Protocol · ISO 14064-3' },
            { label: 'Verification path',        value: 'Bureau Veritas · DNV' },
          ].map(({ label, value, highlight }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: '#52525b', marginBottom: 4, letterSpacing: 1 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? '#1D9E75' : '#d4d4d8' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Standards */}
      <div style={{ background: '#111114', border: '1px solid #27272a', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #27272a', fontSize: 11, color: '#52525b', letterSpacing: 2, textTransform: 'uppercase' }}>
          Standards alignment
        </div>
        {[
          { std: 'GHG Protocol Scope 2 Guidance', role: 'Marginal emissions approach — primary accounting framework' },
          { std: 'ISO 14064-3',                   role: 'Third-party verification standard' },
          { std: 'CSRD ESRS E1',                  role: 'Disclosure framework — Scope 2 reporting' },
          { std: 'ADEME Base Carbone',             role: 'Emissions reference data' },
          { std: 'IPCC AR6',                       role: 'Lifecycle emissions reference' },
          { std: 'RTE eCO₂mix · ODRÉ',            role: 'Real-time regional grid data — France' },
        ].map(({ std, role }) => (
          <div key={std} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #18181b', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#d4d4d8', fontWeight: 500 }}>{std}</div>
            <div style={{ fontSize: 11, color: '#52525b', textAlign: 'right', maxWidth: 300 }}>{role}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{
          flex: 1, padding: '12px', background: '#1D9E75', color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12,
          fontFamily: 'inherit', fontWeight: 600,
        }}>
          Export CSRD report (PDF)
        </button>
        <button style={{
          padding: '12px 20px', background: 'transparent', color: '#71717a',
          border: '1px solid #27272a', borderRadius: 8, cursor: 'pointer', fontSize: 12,
          fontFamily: 'inherit',
        }}>
          Export JSON audit trail
        </button>
      </div>
    </div>
  )
}

// ── Small UI components ───────────────────────────────────────────────────────

function InputCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#111114', border: '1px solid #27272a', borderRadius: 10, padding: '16px' }}>
      <div style={{ fontSize: 10, color: '#52525b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

function PillarCard({ number, title, subtitle, color, children }: {
  number: string; title: string; subtitle: string; color: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: '#111114', border: `1px solid ${color}30`, borderRadius: 10, padding: 16, borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%', background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>{number}</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7' }}>{title}</div>
          <div style={{ fontSize: 10, color: '#52525b' }}>{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

function PillarMetric({ label, value, dim, highlight }: { label: string; value: string; dim?: boolean; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid #18181b' }}>
      <span style={{ fontSize: 10, color: dim ? '#3f3f46' : '#71717a' }}>{label}</span>
      <span style={{ fontSize: 12, color: highlight ? '#e4e4e7' : dim ? '#3f3f46' : '#a1a1aa', fontWeight: highlight ? 600 : 400 }}>{value}</span>
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: '100%', padding: '7px 10px',
      background: '#18181b', border: '1px solid #27272a', borderRadius: 6,
      color: '#d4d4d8', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function NumInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <input
      type="number" value={value} min={min} max={max} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{
        width: '80px', padding: '5px 8px',
        background: '#18181b', border: '1px solid #27272a', borderRadius: 6,
        color: '#d4d4d8', fontSize: 12, fontFamily: 'inherit', textAlign: 'right',
      }}
    />
  )
}

function FieldRow({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#71717a' }}>{label} <span style={{ color: '#3f3f46' }}>({unit})</span></span>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: '#71717a', marginBottom: 6 }}>{children}</div>
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, color: '#3f3f46', lineHeight: 1.5, marginTop: 4 }}>{children}</div>
}

function EmptyState({ mode }: { mode: Mode }) {
  return (
    <div style={{
      background: '#111114', border: '1px solid #27272a', borderRadius: 10,
      minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12, color: '#3f3f46', textAlign: 'center', padding: 40,
    }}>
      <div style={{ fontSize: 32 }}>⬡</div>
      <div style={{ fontSize: 13, color: '#52525b' }}>
        {mode === 'annual'
          ? 'Configure annual volumes and compute the certified CO₂ delta'
          : 'Events are pre-loaded — press compute to run event-level certification'}
      </div>
      <div style={{ fontSize: 11, color: '#3f3f46' }}>
        Three pillars · counterfactual delta · CSRD-ready output
      </div>
    </div>
  )
}
