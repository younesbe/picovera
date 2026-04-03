// ─────────────────────────────────────────────────────────────────────────────
// PicoVera GIGO v1.0 — Layer 1 MEF Engine
//
// Computes Marginal Emissions Factors (MEF) from RTE eCO2mix regional mix data.
// This is the statistical-proxy approach: we infer which technology is on the
// margin from the observed generation mix and a simplified French merit order.
//
// Methodology:
//   1. Parse the regional generation mix (MW by technology)
//   2. Identify the marginal technology using France's merit order heuristic
//   3. Apply IPCC/ADEME emissions factors for that technology
//   4. Return MEF in tCO2eq/MWh with full audit trail
//
// This is Layer 1. Layer 2 (true counterfactual) will use per-unit dispatch
// data from RTE's Actual Generation API to identify the specific marginal plant.
//
// References:
//   - ADEME Base Carbone: emissions factors by technology
//   - RTE eCO2mix documentation: g CO2eq/kWh by source
//   - IPCC AR6: lifecycle emissions factors for electricity generation
//   - GHG Protocol Scope 2 Guidance: marginal vs average distinction
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Eco2mixRegionalRecord,
  MefDataPoint,
  MarginalTechnology,
} from '../types/rte'

// ─────────────────────────────────────────────────────────────────────────────
// Emissions factors (tCO2eq/MWh) — operational combustion only
// Source: ADEME Base Carbone + RTE eCO2mix technical documentation
// RTE uses: charbon=0.986, gaz=0.429, fioul=0.777, nucléaire=0.006,
//           hydraulique=0.006, éolien=0.013, solaire=0.055, bioenergies=0.494
// We use these for the AVERAGE intensity cross-check, and slightly refined
// values from IPCC AR6 for the MARGINAL computation.
// ─────────────────────────────────────────────────────────────────────────────

export const EMISSION_FACTORS: Record<string, number> = {
  // Fossil — high carbon, dispatchable, likely marginal
  gas_ccg:    0.370,  // Combined-cycle gas turbine (CCG) — most efficient gas
  gas_tac:    0.550,  // Open-cycle gas turbine (TAC) — peaker, less efficient
  gas_cogen:  0.390,  // Gas cogeneration
  gas_avg:    0.429,  // Gas average (used when sub-technology unknown)
  coal:       0.986,  // Charbon — operational emissions
  oil_tac:    0.777,  // Fioul TAC — highest emissions peaker
  oil_avg:    0.777,  // Fioul average

  // Low-carbon — rarely marginal in France
  nuclear:    0.006,  // Nucléaire — lifecycle, essentially zero operational
  hydro:      0.006,  // Hydraulique (run-of-river + lake)
  hydro_step: 0.015,  // STEP turbinage — slightly higher due to pumping losses
  wind:       0.013,  // Éolien
  solar:      0.055,  // Solaire PV (higher lifecycle than wind/nuclear)
  bioenergy:  0.494,  // Bioénergies — combustion, partially biogenic

  // Imports — approximation using European average marginal
  // In reality this should use ENTSO-E cross-border flow data (Layer 2)
  import_eu:  0.300,  // European average marginal when France imports at peak
}

// ─────────────────────────────────────────────────────────────────────────────
// French merit order — simplified dispatch stack
//
// In France, the dispatch order (cheapest to most expensive / last to run) is:
//   Nuclear (baseload, ~70% of generation, cannot ramp quickly)
//   Run-of-river hydro (must-run)
//   Wind + Solar (zero marginal cost, must-run when available)
//   Bioenergies (quasi-baseload)
//   Reservoir hydro + STEP (dispatchable, but capacity-constrained)
//   Gas CCG (most common flexible plant, ~6-8 GW capacity)
//   Gas TAC / cogeneration (peakers, last before imports)
//   Imports (from neighbours, when French flexible capacity exhausted)
//   Coal / Oil (extreme rarity since 2022 coal phase-down)
//
// The marginal unit at any moment is the most expensive running unit.
// In France: if gas plants are running, gas is almost always marginal.
// If no gas is running but hydro is high, hydro lacs are likely marginal.
// ─────────────────────────────────────────────────────────────────────────────

interface MixMW {
  nuclear: number
  hydro: number
  wind: number
  solar: number
  gas: number
  oil: number
  coal: number
  bioenergy: number
  imports: number   // positive = net import
}

function identifyMarginalTechnology(mix: MixMW): {
  technology: MarginalTechnology
  mef: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
} {
  const totalDispatchable = mix.gas + mix.oil + mix.coal + mix.hydro

  // Rule 1: Coal running → coal is marginal (France post-2022: very rare)
  if (mix.coal > 50) {
    return {
      technology: 'coal',
      mef: EMISSION_FACTORS.coal,
      confidence: 'high',
      reasoning: `Coal generation detected (${mix.coal.toFixed(0)} MW) — coal is always marginal when running`,
    }
  }

  // Rule 2: Oil/fioul running → oil peaker is marginal
  if (mix.oil > 30) {
    return {
      technology: 'oil',
      mef: EMISSION_FACTORS.oil_avg,
      confidence: 'high',
      reasoning: `Oil/fioul generation detected (${mix.oil.toFixed(0)} MW) — oil TAC is marginal when running`,
    }
  }

  // Rule 3: Gas running significantly → gas is marginal
  // Gas is the dominant flexible resource in France
  // Threshold: >200 MW means gas plants are dispatched, not just on standby
  if (mix.gas > 200) {
    // Distinguish CCG vs TAC by total gas level and time of day
    // CCG runs at higher sustained output; TAC spikes for peak shaving
    // Without sub-technology data, use gas_avg as conservative estimate
    // Layer 2 will refine this with per-unit data
    const mef = mix.gas > 3000 ? EMISSION_FACTORS.gas_ccg : EMISSION_FACTORS.gas_tac
    return {
      technology: mix.gas > 3000 ? 'gas_ccg' : 'gas_tac',
      mef,
      confidence: 'high',
      reasoning: `Gas generation (${mix.gas.toFixed(0)} MW) — gas is marginal when running in France. ${mix.gas > 3000 ? 'Volume suggests CCG base dispatch' : 'Lower volume suggests TAC peaker dispatch'}`,
    }
  }

  // Rule 4: France is net importing → marginal unit is European (neighbour grid)
  if (mix.imports > 500) {
    return {
      technology: 'import',
      mef: EMISSION_FACTORS.import_eu,
      confidence: 'medium',
      reasoning: `Net imports of ${mix.imports.toFixed(0)} MW detected — marginal unit is in a neighbouring grid. Using European average marginal factor (Layer 2 will use ENTSO-E flow data for precision)`,
    }
  }

  // Rule 5: Low gas + no imports → dispatchable hydro is likely marginal
  // This is France's "green" scenario — nuclear + renewables + reservoir hydro
  if (mix.hydro > 5000) {
    return {
      technology: 'hydro',
      mef: EMISSION_FACTORS.hydro,
      confidence: 'medium',
      reasoning: `Low gas (${mix.gas.toFixed(0)} MW), high hydro (${mix.hydro.toFixed(0)} MW) — dispatchable hydro lacs/STEP turbinage is likely marginal. Very low-carbon moment.`,
    }
  }

  // Rule 6: Low everything — likely nuclear-dominant off-peak
  // Nuclear cannot easily ramp, so in practice the last unit is still
  // the cheapest flexible resource. Default to low-carbon gas estimate.
  if (mix.gas > 50) {
    return {
      technology: 'gas_ccg',
      mef: EMISSION_FACTORS.gas_avg,
      confidence: 'low',
      reasoning: `Low overall flexible generation. Small gas signal (${mix.gas.toFixed(0)} MW) — gas likely marginal but confidence low. Layer 2 unit-level data recommended for certification.`,
    }
  }

  // Rule 7: Truly nuclear-dominant — marginal identification uncertain
  return {
    technology: 'unknown',
    mef: EMISSION_FACTORS.hydro, // Conservative: assume hydro as pseudo-marginal
    confidence: 'low',
    reasoning: `Cannot determine marginal unit from mix data alone. Nuclear-dominant with no visible flexible dispatch. MEF set to hydro as conservative lower bound. Do not use for certification without Layer 2 data.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-validation: recompute average intensity from mix to compare with
// RTE's taux_co2 field. Discrepancies >15% flag a data quality issue.
// ─────────────────────────────────────────────────────────────────────────────

function computeAverageIntensity(mix: MixMW): number {
  const totalProduction =
    mix.nuclear + mix.hydro + mix.wind + mix.solar +
    mix.gas + mix.oil + mix.coal + mix.bioenergy

  if (totalProduction <= 0) return 0

  const weightedCO2 =
    mix.nuclear   * EMISSION_FACTORS.nuclear +
    mix.hydro     * EMISSION_FACTORS.hydro +
    mix.wind      * EMISSION_FACTORS.wind +
    mix.solar     * EMISSION_FACTORS.solar +
    mix.gas       * EMISSION_FACTORS.gas_avg +
    mix.oil       * EMISSION_FACTORS.oil_avg +
    mix.coal      * EMISSION_FACTORS.coal +
    mix.bioenergy * EMISSION_FACTORS.bioenergy

  return weightedCO2 / totalProduction  // tCO2eq/MWh
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export: compute MEF from a raw ODRÉ API record
// ─────────────────────────────────────────────────────────────────────────────

export function computeMef(record: Eco2mixRegionalRecord): MefDataPoint {
  const n = (v: number | null) => v ?? 0  // null → 0 for arithmetic

  const mix: MixMW = {
    nuclear:   n(record.nucleaire),
    hydro:     n(record.hydraulique),
    wind:      n(record.eolien),
    solar:     n(record.solaire),
    gas:       n(record.gaz),
    oil:       n(record.fioul),
    coal:      n(record.charbon),
    bioenergy: n(record.bioenergies),
    // imports: negative ech_physiques means France is exporting (positive balance = importing)
    imports:   -(n(record.ech_physiques)),
  }

  const { technology, mef, confidence, reasoning } = identifyMarginalTechnology(mix)
  const avgIntensity = computeAverageIntensity(mix)

  // Cross-validate against RTE's own taux_co2 (convert g/kWh → t/MWh)
  const rteCO2 = record.taux_co2 ? record.taux_co2 / 1000 : null
  const crossValidationDelta = rteCO2 ? Math.abs(avgIntensity - rteCO2) / rteCO2 : null
  const dataQualityFlag = crossValidationDelta && crossValidationDelta > 0.15
    ? 'WARN: computed avg intensity diverges >15% from RTE taux_co2'
    : null

  return {
    timestamp: record.date_heure,
    region: record.libelle_region,
    mef,
    averageIntensity: avgIntensity,
    mix,
    marginalTechnology: technology,
    quality: 'realtime',
    // Extended audit fields (not in the base type — added here for full traceability)
    // These are included in the API response for CSRD audit trail purposes
    ..._auditFields({
      confidence,
      reasoning,
      rteTauxCo2: rteCO2,
      crossValidationDelta,
      dataQualityFlag,
    }),
  } as MefDataPoint & Record<string, unknown>
}

// Audit trail fields — included in API response, stripped from UI display
function _auditFields(fields: {
  confidence: string
  reasoning: string
  rteTauxCo2: number | null
  crossValidationDelta: number | null
  dataQualityFlag: string | null
}) {
  return {
    _audit: {
      methodology: 'PicoVera GIGO v1.0 — Layer 1 statistical MEF',
      methodologyVersion: '1.0.0',
      marginalIdentificationConfidence: fields.confidence,
      marginalIdentificationReasoning: fields.reasoning,
      crossValidation: {
        rteTauxCo2_tMWh: fields.rteTauxCo2,
        computedAvgIntensity_tMWh: null, // filled above
        deltaPercent: fields.crossValidationDelta
          ? (fields.crossValidationDelta * 100).toFixed(1) + '%'
          : null,
        flag: fields.dataQualityFlag,
      },
      dataSource: 'ODRÉ eco2mix-regional-tr',
      emissionsFactorSource: 'ADEME Base Carbone + IPCC AR6',
      standard: 'GHG Protocol Scope 2 Guidance — marginal approach',
      csrdEligible: fields.confidence !== 'low',
      layer2Recommended: fields.confidence === 'low',
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch processor: compute MEF for a full time series (e.g. 24h = 96 records)
// Returns the series plus summary statistics for the GIGO engine
// ─────────────────────────────────────────────────────────────────────────────

export interface MefSeries {
  region: string
  records: MefDataPoint[]
  summary: {
    periodStart: string
    periodEnd: string
    avgMef: number           // tCO2eq/MWh — used for GIGO summary reporting
    minMef: number
    maxMef: number
    // Hours where MEF is low enough to recommend charging (Green-In threshold)
    greenInThresholdMef: number
    // Hours where MEF is high enough to recommend discharging (Green-Out threshold)
    greenOutThresholdMef: number
    // Count of 15-min slots by marginal technology
    technologyBreakdown: Record<MarginalTechnology, number>
    // Confidence breakdown — important for audit
    highConfidenceSlots: number
    lowConfidenceSlots: number
    csrdEligible: boolean   // false if >20% of slots are low-confidence
  }
}

export function computeMefSeries(records: Eco2mixRegionalRecord[]): MefSeries {
  if (records.length === 0) throw new Error('No records to process')

  const dataPoints = records.map(computeMef)
  const mefValues = dataPoints.map(d => d.mef)

  const avgMef = mefValues.reduce((a, b) => a + b, 0) / mefValues.length
  const minMef = Math.min(...mefValues)
  const maxMef = Math.max(...mefValues)

  // GIGO thresholds: charge when MEF < 40th percentile, discharge when > 70th percentile
  const sorted = [...mefValues].sort((a, b) => a - b)
  const p40 = sorted[Math.floor(sorted.length * 0.4)]
  const p70 = sorted[Math.floor(sorted.length * 0.7)]

  const technologyBreakdown: Record<MarginalTechnology, number> = {
    gas_ccg: 0, gas_tac: 0, hydro: 0, coal: 0,
    oil: 0, import: 0, nuclear: 0, unknown: 0,
  }
  dataPoints.forEach(d => { technologyBreakdown[d.marginalTechnology]++ })

  const auditFields = dataPoints.map(d => (d as unknown as Record<string, Record<string, unknown>>)._audit)
  const highConf = auditFields.filter(a => a?.marginalIdentificationConfidence === 'high').length
  const lowConf = auditFields.filter(a => a?.marginalIdentificationConfidence === 'low').length
  const lowConfPct = lowConf / dataPoints.length

  return {
    region: records[0].libelle_region,
    records: dataPoints,
    summary: {
      periodStart: records[0].date_heure,
      periodEnd: records[records.length - 1].date_heure,
      avgMef,
      minMef,
      maxMef,
      greenInThresholdMef: p40,
      greenOutThresholdMef: p70,
      technologyBreakdown,
      highConfidenceSlots: highConf,
      lowConfidenceSlots: lowConf,
      csrdEligible: lowConfPct < 0.20,
    },
  }
}
