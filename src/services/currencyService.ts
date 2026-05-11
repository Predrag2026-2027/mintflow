// currencyService.ts
// Koristi Supabase Edge Function kao proxy za kurs.resenje.org (NBS zvanični srednji kurs)

declare const process: { env: Record<string, string | undefined> }

export interface ExchangeRate {
  from: string
  to: string
  rate: number      // RSD po jedinici valute (exchange_middle) — za prikaz korisniku
  usdRate: number   // RSD/USD kurs — za konverziju u USD
  date: string
  source: string
}

const rateCache: Map<string, ExchangeRate> = new Map()

// Vite koristi import.meta.env, React CRA koristi process.env
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || ''
const NBS_PROXY = `${SUPABASE_URL}/functions/v1/nbs-rate`

function toIsoDate(date: string): string {
  if (!date) return new Date().toISOString().split('T')[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const parts = date.split('.')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return date
}

function nearestBusinessDay(isoDate: string): string {
  const d = new Date(isoDate)
  const day = d.getDay()
  if (day === 0) d.setDate(d.getDate() - 2) // nedelja → petak
  if (day === 6) d.setDate(d.getDate() - 1) // subota → petak
  return d.toISOString().split('T')[0]
}

async function fetchNbsRate(currency: string, isoDate: string): Promise<{ rsdRate: number; source: string }> {
  const url = `${NBS_PROXY}?currency=${currency.toLowerCase()}&date=${isoDate}`

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  })

  if (!response.ok) throw new Error(`NBS proxy: ${response.status}`)

  const data = await response.json()
  if (data.error) throw new Error(`NBS proxy error: ${data.error}`)
  if (!data.exchange_middle) throw new Error('Nema exchange_middle u odgovoru')

  return {
    rsdRate: data.exchange_middle / (data.parity || 1),
    source: `NBS (kurs.resenje.org) za ${data.date}`
  }
}

async function fetchFallbackRate(currency: string): Promise<{ rsdRate: number; source: string }> {
  const apiKey = (import.meta as any).env?.VITE_EXCHANGE_API_KEY || process.env.REACT_APP_EXCHANGE_API_KEY || ''
  if (!apiKey) throw new Error('Nema Exchange API key')

  const response = await fetch(
    `https://v6.exchangerate-api.com/v6/${apiKey}/pair/RSD/${currency}`
  )
  if (!response.ok) throw new Error(`exchangerate-api: ${response.status}`)

  const data = await response.json()
  if (data.result !== 'success') throw new Error('exchangerate-api: neuspešan odgovor')

  const rsdRate = 1 / data.conversion_rate
  return { rsdRate, source: 'Fallback (exchangerate-api.com)' }
}

export async function getRate(
  currency: string,
  date?: string,
  _isIndexed: boolean = false
): Promise<ExchangeRate> {
  if (currency === 'USD') {
    const d = date ? toIsoDate(date) : new Date().toISOString().split('T')[0]
    return { from: 'USD', to: 'USD', rate: 1, usdRate: 1, date: d, source: 'N/A' }
  }

  const isoDate = nearestBusinessDay(toIsoDate(date || new Date().toISOString().split('T')[0]))
  const cacheKey = `${currency}_${isoDate}`

  if (rateCache.has(cacheKey)) return rateCache.get(cacheKey)!

  let rsdRate: number
  let source: string

  try {
    const result = await fetchNbsRate(currency, isoDate)
    rsdRate = result.rsdRate
    source = result.source
  } catch (err) {
    console.warn(`NBS rate fetch failed za ${currency} ${isoDate}:`, err)
    try {
      const result = await fetchFallbackRate(currency)
      rsdRate = result.rsdRate
      source = result.source
    } catch (err2) {
      console.error('Fallback rate fetch failed:', err2)
      const hardcoded: Record<string, number> = { RSD: 100.0, EUR: 117.0, AED: 27.2 }
      rsdRate = hardcoded[currency] || 100.0
      source = 'Hardcoded fallback'
    }
  }

  let usdRate = rsdRate
  if (currency === 'EUR') {
    try {
      const usdResult = await fetchNbsRate('USD', isoDate)
      usdRate = usdResult.rsdRate
    } catch {
      usdRate = 100.0
    }
  }

  const exchangeRate: ExchangeRate = {
    from: currency,
    to: 'USD',
    rate: rsdRate,
    usdRate,
    date: isoDate,
    source
  }

  rateCache.set(cacheKey, exchangeRate)
  return exchangeRate
}

export function convertToUSD(amount: number, currency: string, rate: number): number {
  if (currency === 'USD') return amount
  if (currency === 'RSD') return amount / rate
  if (currency === 'EUR') return amount / rate
  if (currency === 'AED') return amount / rate
  return amount
}

export function convertToEUR(amountUsd: number, eurRsdRate: number, usdRsdRate: number): number {
  if (!eurRsdRate || !usdRsdRate) return amountUsd / 1.1
  const amountRsd = amountUsd * usdRsdRate
  return amountRsd / eurRsdRate
}

export async function getRatesForDate(date: string): Promise<{
  usdRsdRate: number
  eurRsdRate: number
  date: string
  source: string
}> {
  const isoDate = nearestBusinessDay(toIsoDate(date))

  try {
    const [usdResult, eurResult] = await Promise.all([
      fetchNbsRate('USD', isoDate),
      fetchNbsRate('EUR', isoDate)
    ])
    return {
      usdRsdRate: usdResult.rsdRate,
      eurRsdRate: eurResult.rsdRate,
      date: isoDate,
      source: usdResult.source
    }
  } catch (err) {
    console.error('getRatesForDate failed:', err)
    return { usdRsdRate: 100.0, eurRsdRate: 117.0, date: isoDate, source: 'Hardcoded fallback' }
  }
}