const EXCHANGE_API_KEY = process.env.REACT_APP_EXCHANGE_API_KEY

export interface ExchangeRate {
  from: string
  to: string
  rate: number
  date: string
  source: string
}

// NBS XML feed parser za RSD kurseve
export async function fetchNBSRate(currency: string, date: string): Promise<number | null> {
  try {
    const dateObj = new Date(date)
    const day = String(dateObj.getDate()).padStart(2, '0')
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const year = dateObj.getFullYear()

    const response = await fetch(
      `https://kurs.kursna-lista.com/api/exchange-rates?date=${year}-${month}-${day}&currency=${currency}`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (!response.ok) throw new Error('NBS API error')
    const data = await response.json()

    if (data && data.length > 0) {
      const rate = data.find((r: any) => r.currency_code === currency)
      if (rate) return parseFloat(rate.middle_rate)
    }
    return null
  } catch (err) {
    console.error('NBS rate fetch error:', err)
    return null
  }
}

// ExchangeRate-API za AED/USD i fallback
export async function fetchExchangeRate(from: string, to: string = 'USD'): Promise<number | null> {
  try {
    if (!EXCHANGE_API_KEY) {
      console.warn('No exchange API key configured')
      return getFallbackRate(from, to)
    }

    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${EXCHANGE_API_KEY}/pair/${from}/${to}`
    )

    if (!response.ok) throw new Error('ExchangeRate API error')
    const data = await response.json()

    if (data.result === 'success') {
      return data.conversion_rate
    }
    return null
  } catch (err) {
    console.error('Exchange rate fetch error:', err)
    return getFallbackRate(from, to)
  }
}

// Fallback kursevi ako API nije dostupan
function getFallbackRate(from: string, to: string): number {
  const fallbacks: Record<string, number> = {
    'RSD_USD': 1 / 117.4,
    'EUR_USD': 1.082,
    'AED_USD': 0.272,
    'USD_USD': 1,
  }
  return fallbacks[`${from}_${to}`] || 1
}

// Glavna funkcija — poziva pravu API zavisno od valute
export async function getRate(
  currency: string,
  date: string,
  isIndexed: boolean = false
): Promise<ExchangeRate> {
  const rateDate = date || new Date().toISOString().split('T')[0]

  if (currency === 'USD') {
    return { from: 'USD', to: 'USD', rate: 1, date: rateDate, source: 'N/A' }
  }

  if (currency === 'RSD' || currency === 'EUR') {
    // Pokušaj NBS feed
    const nbsRate = await fetchNBSRate(currency, rateDate)
    if (nbsRate) {
      // NBS vraća RSD po jednoj jedinici strane valute
      // Za RSD: koliko RSD = 1 USD → invertujemo
      const usdRate = currency === 'RSD' ? (1 / nbsRate) : nbsRate
      return {
        from: currency,
        to: 'USD',
        rate: currency === 'RSD' ? nbsRate : nbsRate,
        date: rateDate,
        source: 'NBS'
      }
    }
    // Fallback na ExchangeRate-API
    const rate = await fetchExchangeRate(currency, 'USD')
    return {
      from: currency,
      to: 'USD',
      rate: rate || getFallbackRate(currency, 'USD'),
      date: rateDate,
      source: 'ExchangeRate-API (fallback)'
    }
  }

  if (currency === 'AED') {
    const rate = await fetchExchangeRate('AED', 'USD')
    return {
      from: 'AED',
      to: 'USD',
      rate: rate || 0.272,
      date: rateDate,
      source: 'ExchangeRate-API'
    }
  }

  return { from: currency, to: 'USD', rate: 1, date: rateDate, source: 'Manual' }
}

// Konverzija iznosa u USD
export function convertToUSD(amount: number, currency: string, rate: number): number {
  if (currency === 'USD') return amount
  if (currency === 'RSD' || currency === 'EUR') return amount / rate
  if (currency === 'AED') return amount * rate
  return amount
}