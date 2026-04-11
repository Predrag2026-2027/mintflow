export interface ExchangeRate {
  from: string
  to: string
  rate: number
  date: string
  source: string
}

export async function getRate(
  currency: string,
  date: string,
  isIndexed: boolean = false
): Promise<ExchangeRate> {
  const rateDate = date || new Date().toISOString().split('T')[0]

  if (currency === 'USD') {
    return { from: 'USD', to: 'USD', rate: 1, date: rateDate, source: 'N/A' }
  }

  if (currency === 'RSD') {
    try {
      const response = await fetch(
        `https://kurs.resenje.org/api/v1/currencies/usd/rates/${rateDate}`
      )
      if (response.ok) {
        const data = await response.json()
        if (data.rate) {
          return {
            from: 'RSD',
            to: 'USD',
            rate: data.rate,
            date: rateDate,
            source: 'NBS via kurs.resenje.org'
          }
        }
      }
    } catch (err) {
      console.error('NBS rate fetch error:', err)
    }
    return { from: 'RSD', to: 'USD', rate: 117.0, date: rateDate, source: 'Fallback' }
  }

  if (currency === 'EUR') {
    try {
      const response = await fetch(
        `https://kurs.resenje.org/api/v1/currencies/eur/rates/${rateDate}`
      )
      if (response.ok) {
        const data = await response.json()
        if (data.rate) {
          const eurToUsd = await fetch(
            `https://v6.exchangerate-api.com/v6/${process.env.REACT_APP_EXCHANGE_API_KEY}/pair/EUR/USD`
          )
          if (eurToUsd.ok) {
            const eurData = await eurToUsd.json()
            return {
              from: 'EUR',
              to: 'USD',
              rate: eurData.conversion_rate || 1.08,
              date: rateDate,
              source: 'ExchangeRate-API'
            }
          }
        }
      }
    } catch (err) {
      console.error('EUR rate fetch error:', err)
    }
    return { from: 'EUR', to: 'USD', rate: 1.08, date: rateDate, source: 'Fallback' }
  }

  if (currency === 'AED') {
    try {
      const response = await fetch(
        `https://v6.exchangerate-api.com/v6/${process.env.REACT_APP_EXCHANGE_API_KEY}/pair/AED/USD`
      )
      if (response.ok) {
        const data = await response.json()
        if (data.conversion_rate) {
          return {
            from: 'AED',
            to: 'USD',
            rate: data.conversion_rate,
            date: rateDate,
            source: 'ExchangeRate-API'
          }
        }
      }
    } catch (err) {
      console.error('AED rate fetch error:', err)
    }
    return { from: 'AED', to: 'USD', rate: 0.272, date: rateDate, source: 'Fallback' }
  }

  return { from: currency, to: 'USD', rate: 1, date: rateDate, source: 'Manual' }
}

export function convertToUSD(amount: number, currency: string, rate: number): number {
  if (currency === 'USD') return amount
  if (currency === 'RSD') return amount / rate
  if (currency === 'EUR') return amount * rate
  if (currency === 'AED') return amount * rate
  return amount
}