import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── Parse request ────────────────────────────────────
  const body = await req.json().catch(() => ({}))
  const targetSite: string | null = body.site || null // null = sync all sites

  // ── Date range: YTD from Jan 1 current year ──────────
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const dateFrom = Math.floor(yearStart.getTime() / 1000)
  const dateTo   = Math.floor(now.getTime() / 1000)

  // ── Load active credentials ──────────────────────────
  let credQuery = supabase
    .from('integration_credentials')
    .select('*')
    .eq('provider', 'chargebee')
    .eq('is_active', true)

  if (targetSite) credQuery = credQuery.eq('site', targetSite)

  const { data: creds, error: credErr } = await credQuery
  if (credErr || !creds?.length) {
    return new Response(
      JSON.stringify({ error: 'No active Chargebee credentials found', detail: credErr }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Load site → brand mapping ────────────────────────
  const { data: siteBrands } = await supabase
    .from('chargebee_site_brands')
    .select('*')
    .eq('is_active', true)

  const brandMap: Record<string, any> = {}
  siteBrands?.forEach(sb => { brandMap[sb.site] = sb })

  const results: any[] = []

  // ── Process each site ────────────────────────────────
  for (const cred of creds) {
    const site    = cred.site
    const apiKey  = cred.api_key
    const brand   = brandMap[site]

    if (!brand) {
      results.push({ site, status: 'skipped', reason: 'No brand mapping' })
      continue
    }

    // Create sync log entry
    const { data: logRow } = await supabase
      .from('sync_logs')
      .insert({
        provider: 'chargebee',
        site,
        status: 'running',
        date_from: yearStart.toISOString().slice(0, 10),
        date_to: now.toISOString().slice(0, 10),
      })
      .select()
      .single()

    const logId = logRow?.id
    let fetched = 0, created = 0, skipped = 0
    let errorMsg: string | null = null

    try {
      // ── Paginate through all transactions ────────────
      let offset: string | null = null
      let hasMore = true

      while (hasMore) {
        const params = new URLSearchParams({
          limit: '100',
          'date[after]': String(dateFrom),
          'date[before]': String(dateTo),
          // Only fetch successful payments and refunds
          'type[in]': '[payment,refund,payment_reversal]',
        })
        if (offset) params.set('offset', offset)

        const url = `https://${site}.chargebee.com/api/v2/transactions?${params}`
        const resp = await fetch(url, {
          headers: {
            'Authorization': 'Basic ' + btoa(apiKey + ':'),
            'Content-Type': 'application/json',
          },
        })

        if (!resp.ok) {
          const errText = await resp.text()
          throw new Error(`Chargebee API error ${resp.status}: ${errText}`)
        }

        const data = await resp.json()
        const transactions: any[] = data.list || []
        fetched += transactions.length

        // ── Upsert each transaction ──────────────────
        for (const item of transactions) {
          const tx = item.transaction

          // Only process success transactions for revenue
          // (failures tracked for analysis but not as revenue)
          const isRevenue = tx.status === 'success' && tx.type === 'payment'
          const isRefund  = tx.status === 'success' && (tx.type === 'refund' || tx.type === 'payment_reversal')

          if (!isRevenue && !isRefund) {
            skipped++
            continue
          }

          const amountUsd = tx.amount / 100 // cents → dollars
          const txDate    = new Date(tx.date * 1000).toISOString()

          // Check if already exists
          const { data: existing } = await supabase
            .from('revenue_collections')
            .select('id')
            .eq('reference', tx.id)
            .eq('processor', 'chargebee_' + site)
            .single()

          if (existing) { skipped++; continue }

          // Determine processor from gateway
          let processor = 'other'
          if (tx.gateway === 'braintree') {
            processor = tx.payment_method === 'paypal_express_checkout' ? 'paypal' : 'braintree'
          } else if (tx.gateway === 'stripe') {
            processor = site === 'aimfox' ? 'stripe_uae' : 'stripe_us'
          }

          // Insert revenue_collection
          const { error: insErr } = await supabase
            .from('revenue_collections')
            .insert({
              company_id:       brand.company_id,
              processor:        `chargebee_${site}`,
              transaction_date: txDate,
              currency:         tx.currency_code || 'USD',
              amount:           isRefund ? -amountUsd : amountUsd,
              amount_usd:       isRefund ? -amountUsd : amountUsd,
              exchange_rate:    tx.exchange_rate || 1,
              reference:        tx.id,
              notes: JSON.stringify({
                chargebee_site:      site,
                brand:               brand.brand,
                gateway:             tx.gateway,
                gateway_processor:   processor,
                id_at_gateway:       tx.id_at_gateway,
                payment_method:      tx.payment_method,
                customer_id:         tx.customer_id,
                subscription_id:     tx.subscription_id,
                linked_invoice_id:   tx.linked_invoices?.[0]?.invoice_id || null,
                type:                tx.type,
                status:              tx.status,
              }),
              status: 'unmatched',
            })

          if (insErr) {
            console.error('Insert error:', insErr)
            skipped++
          } else {
            created++
          }
        }

        // Pagination
        if (data.next_offset) {
          offset = data.next_offset
        } else {
          hasMore = false
        }
      }

      // Update sync log — success
      await supabase.from('sync_logs').update({
        status: 'success',
        finished_at: new Date().toISOString(),
        records_fetched: fetched,
        records_created: created,
        records_skipped: skipped,
      }).eq('id', logId)

      results.push({ site, brand: brand.brand, status: 'success', fetched, created, skipped })

    } catch (err: any) {
      errorMsg = err.message || String(err)
      console.error(`Error syncing ${site}:`, errorMsg)

      await supabase.from('sync_logs').update({
        status: 'error',
        finished_at: new Date().toISOString(),
        records_fetched: fetched,
        records_created: created,
        records_skipped: skipped,
        error_message: errorMsg,
      }).eq('id', logId)

      results.push({ site, status: 'error', error: errorMsg, fetched, created, skipped })
    }
  }

  return new Response(
    JSON.stringify({ ok: true, year: now.getFullYear(), results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})