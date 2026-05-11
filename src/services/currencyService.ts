// currencyService.ts
// Koristi kurs.resenje.org — zvanični NBS srednji kurs, istorijski po datumu
// Nema potrebe za API key-em. Fallback na exchangerate-api ako resenje.org ne radi.

export interface ExchangeRate {
  from: string
  to: string
  rate: number      // koliko RSD = 1 strana valuta (exchange_middle)
  usdRate: number   // konverzija u USD (amount / usdRate)
  date: string
  source: string
}

// Cache da ne bismo pravili višestruke pozive za isti datum
const rateCache: Map<string, ExchangeRate> = new Map()

// Formatira datum u YYYY-MM-DD za API poziv
function toIsoDate(date: string): string {
  if (!date) return new Date().toISOString().split('T')[0]
  // Već ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  // DD.MM.YYYY → YYYY-MM-DD
  const parts = date.split('.')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return date
}

// Vraća najbliži radni dan unazad (NBS ne objavljuje vikendom)
function nearestBusinessDay(isoDate: string): string {
  const d = new Date(isoDate)
  const day = d.getDay()
  if (day === 0) d.setDate(d.getDate() - 2) // nedelja → petak
  if (day === 6) d.setDate(d.getDate() - 1) // subota → petak
  return d.toISOString().split('T')[0]
}

// Fetchuje kurs sa kurs.resenje.org (NBS podaci)
// Vraća exchange_middle u RSD za datu valutu
async function fetchNbsRate(currency: string, isoDate: string): Promise<{ rsdRate: number; source: string }> {
  const code = currency.toLowerCase()
  const url = `https://kurs.resenje.org/api/v1/currencies/${code}/rates/${isoDate}`

  const response = await fetch(url)
  if (!response.ok) throw new Error(`kurs.resenje.org: ${response.status}`)

  const data = await response.json()
  if (!data.exchange_middle) throw new Error('Nema exchange_middle u odgovoru')

  // exchange_middle je koliko RSD = 1 jedinica strane valute (parity)
  // npr. USD: exchange_middle = 100.0086 → 1 USD = 100.0086 RSD
  // EUR: exchange_middle = 117.3801 → 1 EUR = 117.3801 RSD
  return {
    rsdRate: data.exchange_middle / (data.parity || 1),
    source: `NBS (kurs.resenje.org) za ${data.date}`
  }
}

// Fetchuje kurs sa exchangerate-api.com kao fallback
async function fetchFallbackRate(currency: string): Promise<{ rsdRate: number; source: string }> {
  const apiKey = process.env.REACT_APP_EXCHANGE_API_KEY
  if (!apiKey) throw new Error('Nema REACT_APP_EXCHANGE_API_KEY')

  // Fetchujemo RSD/currency pair da dobijemo koliko RSD = 1 strana valuta
  const response = await fetch(
    `https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/${currency}`
  )
  if (!response.ok) throw new Error(`exchangerate-api: ${response.status}`)

  const data = await response.json()
  if (data.result !== 'success') throw new Error('exchangerate-api: neuspešan odgovor')

  // data.conversion_rate = koliko currency dobijamo za 1 USD
  // Trebamo: koliko RSD = 1 currency → fetchujemo RSD/currency
  const r2 = await fetch(
    `https://v6.exchangerate-api.com/v6/${apiKey}/pair/RSD/${currency}`
  )
  const d2 = await r2.json()
  if (d2.result !== 'success') throw new Error('exchangerate-api RSD pair: neuspešan')

  // d2.conversion_rate = koliko currency = 1 RSD → invertujemo
  const rsdRate = 1 / d2.conversion_rate
  return { rsdRate, source: 'Fallback (exchangerate-api.com)' }
}

// ─── Glavna funkcija ───────────────────────────────────────────────────────────
// Vraća ExchangeRate objekat sa svim potrebnim podacima
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

  if (rateCache.has(cacheKey)) {
    return rateCache.get(cacheKey)!
  }

  let rsdRate: number
  let source: string

  try {
    // Primarni izvor: NBS preko kurs.resenje.org
    const result = await fetchNbsRate(currency, isoDate)
    rsdRate = result.rsdRate
    source = result.source
  } catch (err) {
    console.warn(`NBS rate fetch failed za ${currency} ${isoDate}:`, err)
    try {
      // Fallback: exchangerate-api.com
      const result = await fetchFallbackRate(currency)
      rsdRate = result.rsdRate
      source = result.source
    } catch (err2) {
      console.error('Fallback rate fetch failed:', err2)
      // Poslednji resort: hardkodirani kurs
      const hardcoded: Record<string, number> = { RSD: 100.0, EUR: 117.0, AED: 27.2 }
      rsdRate = hardcoded[currency] || 100.0
      source = 'Hardcoded fallback'
    }
  }

  // usdRate = koliko RSD = 1 USD (koristimo za konverziju u USD)
  // Ako fetchujemo RSD direktno, rsdRate je već RSD/USD
  // Ako fetchujemo EUR, rsdRate je RSD/EUR — konverzija u USD ide kroz RSD
  let usdRate = rsdRate // za RSD: amount / usdRate = USD vrednost

  if (currency === 'EUR') {
    // Za EUR transakcije: EUR → RSD → USD
    // usdRate čuvamo kao RSD/USD koji dobijamo posebno
    try {
      const usdResult = await fetchNbsRate('USD', isoDate)
      usdRate = usdResult.rsdRate // RSD/USD
    } catch {
      usdRate = 100.0
    }
  }

  const exchangeRate: ExchangeRate = {
    from: currency,
    to: 'USD',
    rate: rsdRate,    // RSD po jedinici valute (za prikaz korisniku)
    usdRate,          // RSD/USD (za konverziju u USD)
    date: isoDate,
    source
  }

  rateCache.set(cacheKey, exchangeRate)
  return exchangeRate
}

// ─── Konverzija u USD ──────────────────────────────────────────────────────────
// Sve transakcije se konvertuju u USD (reporting valuta)
// RSD i EUR idu kroz RSD/USD kurs
export function convertToUSD(amount: number, currency: string, rate: number): number {
  if (currency === 'USD') return amount
  // rate = RSD po jedinici valute (exchange_middle)
  // za RSD: amount je već u RSD → amount / (RSD/USD kurs)
  // za EUR: amount * (EUR u RSD) / (RSD/USD kurs) — ali ovo se rešava u getRate
  // Ovde rate za RSD = RSD/USD, za EUR = RSD/EUR (a usdRate = RSD/USD)
  if (currency === 'RSD') return amount / rate
  if (currency === 'EUR') return amount / rate  // rate za EUR je RSD/EUR, caller treba da prosledi usdRate
  if (currency === 'AED') return amount / rate
  return amount
}

// ─── Konverzija u EUR (za zatvaranje kredita) ──────────────────────────────────
// Krediti su u EUR → USD transakcija se konvertuje u EUR za praćenje rata
export function convertToEUR(amountUsd: number, eurRsdRate: number, usdRsdRate: number): number {
  if (!eurRsdRate || !usdRsdRate) return amountUsd / 1.1 // fallback
  // USD → RSD → EUR
  const amountRsd = amountUsd * usdRsdRate
  return amountRsd / eurRsdRate
}

// ─── Helper: dohvati i USD i EUR kurs za dati datum ───────────────────────────
// Korisno za credit_payment transakcije koje trebaju oba kursa
export async function getRatesForDate(date: string): Promise<{
  usdRsdRate: number   // koliko RSD = 1 USD
  eurRsdRate: number   // koliko RSD = 1 EUR
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