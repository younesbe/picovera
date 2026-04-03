// app/api/mef/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// PicoVera MEF API Route — Next.js App Router
//
// Fetches real-time regional generation mix from ODRÉ (RTE's open data portal),
// computes Marginal Emissions Factors using the PicoVera GIGO v1.0 Layer 1
// engine, and returns structured MEF data for the demo and production use.
//
// This route runs SERVER-SIDE only. The ODRÉ API key (if required) and any
// future RTE OAuth2 credentials never leave the server.
//
// Endpoint: GET /api/mef
// Query params:
//   region    — French region name (required), e.g. "Île-de-France"
//   hours     — Number of past hours to fetch (default: 24, max: 72)
//   date      — Specific date YYYY-MM-DD (optional, defaults to today)
//
// Response: MefSeries JSON
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { computeMefSeries } from '../../lib/mef'
import type { Eco2mixRegionalRecord, FrenchRegion } from '../../types/rte'
import { FRENCH_REGIONS } from '../../types/rte'

// ODRÉ OpenDataSoft API — no auth required for public datasets
// Rate limit: 50,000 calls/user/month. At 15-min resolution, 24h = 96 records.
const ODRE_BASE = 'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets'
const DATASET_REALTIME = 'eco2mix-regional-tr'
const DATASET_CONSOLIDATED = 'eco2mix-regional-cons-def'

// Cache: MEF data is only updated hourly by ODRÉ, so we cache aggressively
// In production, use Redis or Vercel KV. Here: in-memory cache for demo.
const cache = new Map<string, { data: unknown; fetchedAt: number }>()
const CACHE_TTL_MS = 15 * 60 * 1000  // 15 minutes — matches ODRÉ update frequency

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const region = searchParams.get('region')
  const hours = Math.min(parseInt(searchParams.get('hours') ?? '24'), 72)
  const date = searchParams.get('date')  // optional: YYYY-MM-DD

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!region) {
    return NextResponse.json(
      { error: 'Missing required parameter: region', validRegions: FRENCH_REGIONS },
      { status: 400 }
    )
  }

  if (!FRENCH_REGIONS.includes(region as FrenchRegion)) {
    return NextResponse.json(
      { error: `Unknown region: "${region}"`, validRegions: FRENCH_REGIONS },
      { status: 400 }
    )
  }

  // ── Cache check ─────────────────────────────────────────────────────────────
  const cacheKey = `${region}:${hours}:${date ?? 'today'}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        'X-Cache': 'HIT',
        'X-Cache-Age': String(Math.floor((Date.now() - cached.fetchedAt) / 1000)),
      },
    })
  }

  // ── Build ODRÉ query ─────────────────────────────────────────────────────────
  // Use real-time dataset for recent data, consolidated for historical
  // For the demo we always use real-time (eco2mix-regional-tr)
  try {
    const records = await fetchOdreRecords(region, hours, date)

    if (records.length === 0) {
      return NextResponse.json(
        {
          error: 'No data returned from ODRÉ for this region/period',
          hint: 'Real-time data may have a 1-2 hour lag. Try a recent date.',
          region,
          hours,
        },
        { status: 404 }
      )
    }

    // ── Compute MEF series ────────────────────────────────────────────────────
    const mefSeries = computeMefSeries(records)

    // ── Cache and return ──────────────────────────────────────────────────────
    cache.set(cacheKey, { data: mefSeries, fetchedAt: Date.now() })

    return NextResponse.json(mefSeries, {
      headers: {
        'X-Cache': 'MISS',
        'X-Data-Source': 'ODRÉ eco2mix-regional-tr',
        'X-Methodology': 'PicoVera GIGO v1.0 Layer 1',
        // Allow CORS for demo embedding — tighten in production
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('[PicoVera MEF API] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch or compute MEF data',
        detail: error instanceof Error ? error.message : 'Unknown error',
        fallback: 'Simulation mode available — remove ?region= param to use synthetic data',
      },
      { status: 502 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ODRÉ fetch helper
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOdreRecords(
  region: string,
  hours: number,
  date: string | null
): Promise<Eco2mixRegionalRecord[]> {
  // ODRÉ OpenDataSoft v2.1 API
  // Docs: https://help.opendatasoft.com/apis/ods-explore-v2/
  const limit = hours * 4  // 4 records per hour at 15-min resolution
  const maxLimit = Math.min(limit, 288)  // cap at 72h = 288 records

  // Build date filter
  let whereClause = `libelle_region:"${region}"`
  if (date) {
    whereClause += ` AND date:"${date}"`
  } else {
    // Last N hours from now
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    whereClause += ` AND date_heure >= "${since}"`
  }

  const params = new URLSearchParams({
    where: whereClause,
    order_by: 'date_heure asc',
    limit: String(maxLimit),
    // Request only the fields we use — reduces response size
    select: [
      'date_heure', 'date', 'heure', 'libelle_region', 'code_insee_region',
      'consommation', 'nucleaire', 'hydraulique', 'eolien', 'solaire',
      'gaz', 'fioul', 'charbon', 'bioenergies', 'pompage',
      'ech_physiques', 'taux_co2',
    ].join(','),
  })

  const url = `${ODRE_BASE}/${DATASET_REALTIME}/records?${params}`

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      // If you obtain an ODRÉ API key, add it here:
      // 'Authorization': `Apikey ${process.env.ODRE_API_KEY}`,
    },
    // Next.js fetch cache — revalidate every 15 minutes
    next: { revalidate: 900 },
  })

  if (!response.ok) {
    throw new Error(
      `ODRÉ API returned ${response.status}: ${await response.text().catch(() => 'no body')}`
    )
  }

  const json = await response.json()

  // ODRÉ v2.1 response shape: { total_count: N, results: [...] }
  if (!json.results || !Array.isArray(json.results)) {
    throw new Error(`Unexpected ODRÉ response shape: ${JSON.stringify(json).slice(0, 200)}`)
  }

  // Map ODRÉ field names to our typed interface
  // Field names confirmed from ego2mix Go library + ODRÉ schema documentation
  return json.results.map((r: Record<string, unknown>) => ({
    date_heure:         r.date_heure as string,
    date:               r.date as string,
    heure:              r.heure as string,
    libelle_region:     r.libelle_region as string,
    code_insee_region:  r.code_insee_region as string,
    consommation:       toNum(r.consommation),
    nucleaire:          toNum(r.nucleaire),
    hydraulique:        toNum(r.hydraulique),
    eolien:             toNum(r.eolien),
    solaire:            toNum(r.solaire),
    gaz:                toNum(r.gaz),
    fioul:              toNum(r.fioul),
    charbon:            toNum(r.charbon),
    bioenergies:        toNum(r.bioenergies),
    pompage:            toNum(r.pompage),
    ech_physiques:      toNum(r.ech_physiques),
    taux_co2:           toNum(r.taux_co2),
  })) as Eco2mixRegionalRecord[]
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
