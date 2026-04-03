// hooks/useMef.ts
// ─────────────────────────────────────────────────────────────────────────────
// React hook — fetches live MEF data from the PicoVera /api/mef route
// Falls back to synthetic simulation data if the API is unavailable
// (e.g. when running the static demo without the Next.js backend)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import type { MefSeries } from '../lib/mef'
import type { FrenchRegion } from '../types/rte'

interface UseMefOptions {
  region: FrenchRegion
  hours?: number
  date?: string
  // If true, use synthetic fallback data instead of hitting the API
  // Useful for the public demo when the API isn't configured yet
  simulationMode?: boolean
}

interface UseMefResult {
  data: MefSeries | null
  loading: boolean
  error: string | null
  isSimulated: boolean
  refetch: () => void
}

export function useMef({
  region,
  hours = 24,
  date,
  simulationMode = false,
}: UseMefOptions): UseMefResult {
  const [data, setData] = useState<MefSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSimulated, setIsSimulated] = useState(false)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (simulationMode) {
      // Use synthetic MEF data — same shape as real API response
      await new Promise(r => setTimeout(r, 400)) // simulate network
      setData(buildSyntheticMefSeries(region, hours))
      setIsSimulated(true)
      setLoading(false)
      return
    }

    try {
      const params = new URLSearchParams({ region, hours: String(hours) })
      if (date) params.set('date', date)

      const res = await fetch(`/api/mef?${params}`)

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error ?? `API error ${res.status}`)
      }

      const json: MefSeries = await res.json()
      setData(json)
      setIsSimulated(false)
    } catch (e) {
      console.warn('[useMef] API unavailable, falling back to simulation:', e)
      setData(buildSyntheticMefSeries(region, hours))
      setIsSimulated(true)
      setError(
        e instanceof Error
          ? `Live data unavailable (${e.message}). Showing simulated data.`
          : 'Live data unavailable. Showing simulated data.'
      )
    } finally {
      setLoading(false)
    }
  }, [region, hours, date, simulationMode])

  useEffect(() => { fetch_() }, [fetch_])

  return { data, loading, error, isSimulated, refetch: fetch_ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic MEF series — same shape as real API response
// Used for demo mode and as fallback when ODRÉ is unreachable
// Based on typical French grid patterns (nuclear-dominant with gas peaks)
// ─────────────────────────────────────────────────────────────────────────────

function buildSyntheticMefSeries(region: FrenchRegion, hours: number): MefSeries {
  const slots = hours * 4  // 15-min intervals
  const now = new Date()
  const records = []

  // Regional character — some regions have more renewables, affects MEF profile
  const regionalBias = getRegionalBias(region)

  for (let i = 0; i < slots; i++) {
    const t = new Date(now.getTime() - (slots - i) * 15 * 60 * 1000)
    const hour = t.getHours() + t.getMinutes() / 60

    // Synthetic MEF profile: low at night (nuclear + off-peak), peaks at morning/evening
    const morningPeak = Math.exp(-0.5 * ((hour - 8.5) / 1.8) ** 2)
    const eveningPeak = Math.exp(-0.5 * ((hour - 19.5) / 1.5) ** 2)
    const baseProfile = 0.08 + 0.38 * Math.max(morningPeak * 0.7, eveningPeak)

    // Add regional character and small random variation
    const noise = (Math.random() - 0.5) * 0.02
    const mef = Math.max(0.02, baseProfile * regionalBias.mefMultiplier + noise)

    // Synthetic mix consistent with the MEF level
    const isHighCarbon = mef > 0.25
    const mix = {
      nuclear: 40000 * 0.7 + Math.random() * 5000,
      hydro: 8000 + Math.random() * 3000,
      wind: regionalBias.windBase + Math.random() * 2000,
      solar: hour > 7 && hour < 20
        ? regionalBias.solarBase * Math.sin(Math.PI * (hour - 6) / 14) + Math.random() * 1000
        : 0,
      gas: isHighCarbon ? 4000 + Math.random() * 4000 : 200 + Math.random() * 800,
      oil: 0,
      coal: 0,
      bioenergy: 1000 + Math.random() * 500,
      imports: isHighCarbon ? -500 : 1000 + Math.random() * 1000,
    }

    records.push({
      timestamp: t.toISOString(),
      region,
      mef,
      averageIntensity: mef * 0.4, // average is always well below marginal
      mix,
      marginalTechnology: isHighCarbon
        ? (mef > 0.35 ? 'gas_tac' : 'gas_ccg') as const
        : 'hydro' as const,
      quality: 'realtime' as const,
    })
  }

  const mefValues = records.map(r => r.mef)
  const sorted = [...mefValues].sort((a, b) => a - b)

  return {
    region,
    records,
    summary: {
      periodStart: records[0].timestamp,
      periodEnd: records[records.length - 1].timestamp,
      avgMef: mefValues.reduce((a, b) => a + b, 0) / mefValues.length,
      minMef: Math.min(...mefValues),
      maxMef: Math.max(...mefValues),
      greenInThresholdMef: sorted[Math.floor(sorted.length * 0.4)],
      greenOutThresholdMef: sorted[Math.floor(sorted.length * 0.7)],
      technologyBreakdown: {
        gas_ccg: Math.floor(slots * 0.35),
        gas_tac: Math.floor(slots * 0.15),
        hydro: Math.floor(slots * 0.30),
        coal: 0,
        oil: 0,
        import: Math.floor(slots * 0.10),
        nuclear: 0,
        unknown: Math.floor(slots * 0.10),
      },
      highConfidenceSlots: Math.floor(slots * 0.75),
      lowConfidenceSlots: Math.floor(slots * 0.10),
      csrdEligible: true,
    },
  }
}

// Regional character modifiers — based on actual French grid geography
function getRegionalBias(region: FrenchRegion) {
  const biases: Record<FrenchRegion, { mefMultiplier: number; windBase: number; solarBase: number }> = {
    'Auvergne-Rhône-Alpes':       { mefMultiplier: 0.75, windBase: 500,  solarBase: 1500 }, // heavy hydro + nuclear
    'Bourgogne-Franche-Comté':    { mefMultiplier: 0.90, windBase: 800,  solarBase: 600  },
    'Bretagne':                   { mefMultiplier: 1.20, windBase: 2500, solarBase: 300  }, // no nuclear, high wind, imports gas
    'Centre-Val de Loire':        { mefMultiplier: 0.70, windBase: 900,  solarBase: 800  }, // nuclear-heavy
    'Grand Est':                  { mefMultiplier: 0.75, windBase: 1200, solarBase: 700  }, // nuclear + wind
    'Hauts-de-France':            { mefMultiplier: 1.10, windBase: 3000, solarBase: 400  }, // high wind, some gas
    'Île-de-France':              { mefMultiplier: 1.30, windBase: 100,  solarBase: 200  }, // pure consumption, high imports
    'Normandie':                  { mefMultiplier: 0.65, windBase: 1500, solarBase: 300  }, // most nuclear-dense region
    'Nouvelle-Aquitaine':         { mefMultiplier: 1.05, windBase: 1800, solarBase: 2000 }, // mixed, growing solar
    'Occitanie':                  { mefMultiplier: 0.95, windBase: 2000, solarBase: 3000 }, // highest solar in France
    'Pays de la Loire':           { mefMultiplier: 1.10, windBase: 1500, solarBase: 700  },
    "Provence-Alpes-Côte d'Azur": { mefMultiplier: 1.00, windBase: 600,  solarBase: 2500 }, // solar + imports
    'Corse':                      { mefMultiplier: 1.50, windBase: 200,  solarBase: 400  }, // isolated, diesel backup
  }
  return biases[region] ?? { mefMultiplier: 1.0, windBase: 1000, solarBase: 1000 }
}
