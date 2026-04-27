import React from 'react'

// ── Sparkline ─────────────────────────────────────────────
function Sparkline({ data, color, w = 95, h = 36 }: {
  data: number[]
  color: string
  w?: number
  h?: number
}) {
  if (!data?.length) return <div style={{ width: w, height: h }} />
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pad = 3
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad * 2),
    pad + (1 - (v - min) / range) * (h - pad * 2),
  ])
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `M${pts[0][0]},${pts[0][1]} ${pts.map(([x,y]) => `L${x},${y}`).join(' ')} L${pts[pts.length-1][0]},${h-pad} L${pts[0][0]},${h-pad}Z`
  const [lx, ly] = pts[pts.length - 1]
  const gId = `mf-sg-${color.replace(/[^a-z0-9]/gi, '')}`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gId})`}/>
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={lx} cy={ly} r="2.8" fill={color}/>
    </svg>
  )
}

// ── MetricCard ────────────────────────────────────────────
interface MetricCardProps {
  label: string
  value: string            // formatted, e.g. "$90,500"
  sub: string              // e.g. "YTD Constel Group"
  color: string            // semantic color for number + top border
  darkColor: string        // darker shade for text contrast
  sparklineData: number[]  // raw numbers for sparkline
  trendPct?: number        // e.g. 12.4
  trendUp?: boolean        // true = up arrow (green-ish), false = down (red-ish)
}

export default function MetricCard({
  label, value, sub, color, darkColor, sparklineData, trendPct, trendUp,
}: MetricCardProps) {
  const [hovered, setHovered] = React.useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '1rem 1.1rem 0.9rem',
        border: '1px solid #E8E7E2',
        borderTop: `2.5px solid ${color}`,
        boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        cursor: 'default',
      }}
    >
      {/* Label */}
      <div style={{ fontSize: '10px', fontWeight: '600', color: '#AAAAAA', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
        {label}
      </div>

      {/* Number + Sparkline */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '32px', fontWeight: '400', lineHeight: 1, color: darkColor, marginBottom: '6px', letterSpacing: '-0.01em' }}>
            {value}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {trendPct !== undefined && (
              <span style={{
                fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '20px',
                background: trendUp ? '#E1F5EE' : '#FCEBEB',
                color: trendUp ? '#0B5E49' : '#A32D2D',
              }}>
                {trendUp ? '↑' : '↓'} {Math.abs(trendPct)}%
              </span>
            )}
            <span style={{ fontSize: '10px', color: '#AAAAAA' }}>{sub}</span>
          </div>
        </div>
        <Sparkline data={sparklineData} color={color}/>
      </div>
    </div>
  )
}

// ── Named export for Sparkline (reusable elsewhere) ───────
export { Sparkline }
