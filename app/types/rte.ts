// ─────────────────────────────────────────────────────────────────────────────
// RTE eCO2mix API — confirmed field names from ODRÉ OpenDataSoft schema
// Dataset: eco2mix-regional-tr (real-time regional, 15-min, updated hourly)
// ─────────────────────────────────────────────────────────────────────────────

export interface Eco2mixRegionalRecord {
  // Identity
  date_heure: string        // ISO 8601 datetime, e.g. "2026-04-02T14:00:00+02:00"
  date: string              // "2026-04-02"
  heure: string             // "14:00"
  libelle_region: string    // e.g. "Île-de-France"
  code_insee_region: string // e.g. "11"

  // Consumption (MW)
  consommation: number | null

  // Production by technology (MW) — all can be null for regions without that source
  nucleaire: number | null
  hydraulique: number | null
  eolien: number | null
  solaire: number | null
  gaz: number | null
  fioul: number | null
  charbon: number | null
  bioenergies: number | null
  pompage: number | null       // STEP pumping load (consumption, negative in accounting)

  // Inter-regional physical exchange balance (MW, positive = net import)
  ech_physiques: number | null

  // RTE's own average carbon intensity estimate (g CO2eq/kWh)
  // NOTE: this is an AVERAGE intensity — PicoVera computes MARGINAL intensity
  // from the mix breakdown above. We include it for cross-validation only.
  taux_co2: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// PicoVera MEF output — what our Layer 1 model produces
// ─────────────────────────────────────────────────────────────────────────────

export interface MefDataPoint {
  timestamp: string           // ISO 8601
  region: string
  // Marginal Emissions Factor (tCO2eq/MWh) — PicoVera GIGO v1.0 Layer 1
  mef: number
  // Average intensity from RTE for cross-validation (tCO2eq/MWh)
  averageIntensity: number | null
  // Mix breakdown at this timestamp (MW) — used for MEF computation
  mix: {
    nuclear: number
    hydro: number
    wind: number
    solar: number
    gas: number
    oil: number
    coal: number
    bioenergy: number
    imports: number           // net imports (positive = importing)
  }
  // Which technology is identified as marginal at this timestamp
  marginalTechnology: MarginalTechnology
  // Data quality flag
  quality: 'realtime' | 'consolidated' | 'definitive'
}

export type MarginalTechnology =
  | 'gas_ccg'     // Combined-cycle gas — most common French marginal unit
  | 'gas_tac'     // Gas open-cycle peaker — higher emissions, peak demand
  | 'hydro'       // Dispatchable hydro (lacs/STEP) — low-carbon marginal
  | 'coal'        // Rare in France since 2022, still possible in extremes
  | 'oil'         // Very rare, last resort
  | 'import'      // Net importer — marginal unit is a European neighbour
  | 'nuclear'     // Baseload, never truly marginal in France
  | 'unknown'     // Insufficient data to determine

export type FrenchRegion =
  | 'Auvergne-Rhône-Alpes'
  | 'Bourgogne-Franche-Comté'
  | 'Bretagne'
  | 'Centre-Val de Loire'
  | 'Grand Est'
  | 'Hauts-de-France'
  | 'Île-de-France'
  | 'Normandie'
  | 'Nouvelle-Aquitaine'
  | 'Occitanie'
  | 'Pays de la Loire'
  | "Provence-Alpes-Côte d'Azur"
  | 'Corse'

export const FRENCH_REGIONS: FrenchRegion[] = [
  'Auvergne-Rhône-Alpes',
  'Bourgogne-Franche-Comté',
  'Bretagne',
  'Centre-Val de Loire',
  'Grand Est',
  'Hauts-de-France',
  'Île-de-France',
  'Normandie',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Pays de la Loire',
  "Provence-Alpes-Côte d'Azur",
  'Corse',
]
