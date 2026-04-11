export interface ExchangeRate {
  from: string
  to: string
  rate: number
  date: string
  source: string
}

const EXCHANGE_KEY = process.env.REACT_APP_EXCHANGE_API_KEY

export async function getRate(
  currency: string,
  date: string,
  isIndexed: boolean = false
): Promise<ExchangeRate> {
  const rateDate = date || new Date().toISOString().split('T')[0]

  if (currency === 'USD') {
    return { from: 'USD', to: 'USD', rate: 1, date: rateDate, source: 'N/A' }
  }

  try {
    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${EXCHANGE_KEY}/pair/${currency}/USD`
    )
    if (response.ok) {
      const data = await response.json()
      if (data.result === 'success') {
        const rate = currency === 'RSD'
          ? 1 / data.conversion_rate
          : data.conversion_rate
        return {
          from: currency,
          to: 'USD',
          rate: rate,
          date: rateDate,
          source: 'ExchangeRate-API'
        }
      }
    }
  } catch (err) {
    console.error('Rate fetch error:', err)
  }

  const fallbacks: Record<string, number> = { RSD: 105.0, EUR: 1.08, AED: 0.272 }
  return {
    from: currency,
    to: 'USD',
    rate: fallbacks[currency] || 1,
    date: rateDate,
    source: 'Fallback'
  }
}

export function convertToUSD(amount: number, currency: string, rate: number): number {
  if (currency === 'USD') return amount
  if (currency === 'RSD') return amount / rate
  if (currency === 'EUR') return amount * rate
  if (currency === 'AED') return amount * rate
  return amount
}