#!/usr/bin/env python3
"""
Run this script in your mintflow project root:
  python3 patch_BulkImport.py
  
It will modify src/components/BulkImport.tsx in-place.
"""
import sys, os

path = 'src/components/BulkImport.tsx'
if not os.path.exists(path):
    print(f"ERROR: {path} not found. Run from project root.")
    sys.exit(1)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src

# --- PATCH 1: partnerAccounts state ---
src = src.replace(
    "  const [expenseDescriptions, setExpenseDescriptions] = useState<any[]>([])",
    "  const [expenseDescriptions, setExpenseDescriptions] = useState<any[]>([])\n  const [partnerAccounts, setPartnerAccounts] = useState<any[]>([])"
, 1)

# --- PATCH 2+3: add to Promise.all destructuring ---
src = src.replace(
    "        { data: plCat }, { data: plSub }, { data: dept },\n        { data: deptSub }, { data: expDesc },",
    "        { data: plCat }, { data: plSub }, { data: dept },\n        { data: deptSub }, { data: expDesc }, { data: pacc },"
, 1)

# --- PATCH 2b: add fetch inside Promise.all ---
src = src.replace(
    "        supabase.from('expense_descriptions').select('id,name,dept_subcategory_id,sort_order').order('sort_order'),\n      ])",
    "        supabase.from('expense_descriptions').select('id,name,dept_subcategory_id,sort_order').order('sort_order'),\n        supabase.from('partner_accounts').select('partner_id,account_number'),\n      ])"
, 1)

# --- PATCH 4: set state ---
src = src.replace(
    "      if (expDesc) setExpenseDescriptions(expDesc)\n    }\n    load()\n  }, [])",
    "      if (expDesc) setExpenseDescriptions(expDesc)\n      if (pacc) setPartnerAccounts(pacc)\n    }\n    load()\n  }, [])"
, 1)

# --- PATCH 5: add matchPartnerByAccount helper ---
src = src.replace(
    "  const handleFile = async (file: File) => {",
    """  const matchPartnerByAccount = (accountNum: string, pacc: any[], partList: any[]): string => {
    if (!accountNum) return ''
    const clean = accountNum.replace(/[-\\s]/g, '')
    if (!clean) return ''
    const match = pacc.find((pa: any) => {
      const paClean = (pa.account_number || '').replace(/[-\\s]/g, '')
      return paClean && paClean === clean
    })
    if (!match) return ''
    const partner = partList.find((p: any) => p.id === match.partner_id)
    return partner?.name || ''
  }

  const handleFile = async (file: File) => {"""
, 1)

# --- PATCH 6: apply match after setRows (both occurrences) ---
old_setrows = "        setRows(parsed.map(makeImportRow))"
new_setrows = """        const importRows = parsed.map(makeImportRow)
        setRows(importRows.map(r => {
          const matched = matchPartnerByAccount(r.parsed.account_number, partnerAccounts, partners)
          return matched ? { ...r, override_partner_name: matched } : r
        }))"""

count = src.count(old_setrows)
print(f"Found {count} occurrences of setRows to patch (expected 2)")
src = src.replace(old_setrows, new_setrows)

# --- PATCH 7: fix overflow on reviewRow ---
src = src.replace(
    "  reviewRow: { border: '0.5px solid #e5e5e5', borderRadius: '10px', background: '#fff', overflow: 'hidden' },",
    "  reviewRow: { border: '0.5px solid #e5e5e5', borderRadius: '10px', background: '#fff', overflow: 'visible' },"
, 1)

if src == original:
    print("WARNING: No changes were made. Check that the file matches expected content.")
else:
    changed = sum(1 for a, b in zip(original.splitlines(), src.splitlines()) if a != b)
    print(f"Applied patches successfully ({changed} lines changed)")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print(f"Done! Saved to {path}")
