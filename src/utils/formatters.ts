// ── Currency formatters ───────────────────────────────────
// USD and all amounts shown in USD context
export const fmtUSD = (n: number, decimals = 0): string => {
  if (!n && n !== 0) return '—'
  return '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// USD with sign (+ or -)
export const fmtUSDSigned = (n: number, decimals = 0): string => {
  if (!n && n !== 0) return '—'
  const prefix = n < 0 ? '-$' : '$'
  return prefix + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Local currency (RSD, EUR, AED) — Serbian locale: 1.234,56 RSD
export const fmtLocal = (n: number, currency: string, decimals = 2): string => {
  if (!n && n !== 0) return '—'
  return Math.abs(n).toLocaleString('sr-RS', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + ' ' + currency
}

// Smart formatter — picks format based on currency
export const fmtAmount = (n: number, currency: string): string => {
  if (!n && n !== 0) return '—'
  if (currency === 'USD') return fmtUSD(n, 2)
  return fmtLocal(n, currency)
}

// Percentage
export const fmtPct = (n: number, decimals = 1): string => {
  if (!n && n !== 0) return '—'
  return n.toFixed(decimals) + '%'
}

// Short number (for cards/summaries) — no decimals
export const fmtShort = (n: number, currency = 'USD'): string => {
  if (!n && n !== 0) return '—'
  if (currency === 'USD') return fmtUSD(n, 0)
  return fmtLocal(n, currency, 0)
}