#!/usr/bin/env python3
"""
Run from mintflow project root:
  python3 patch_Partners_refactor.py

Updates Partners.tsx to import PartnerDialog from the new shared component.
"""
import sys, os

path = 'src/pages/Partners.tsx'
if not os.path.exists(path):
    print(f"ERROR: {path} not found."); sys.exit(1)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src

# 1. Add import
src = src.replace(
    "import { supabase } from '../supabase'",
    "import { supabase } from '../supabase'\nimport PartnerDialog from '../components/PartnerDialog'",
    1
)

# 2. Remove the local PartnerDialog function (from its definition to closing })
# Find exact start and end
start_marker = "function PartnerDialog({ partner, onClose, onSaved, onDelete }"
end_marker = "\nconst s: Record<string, React.CSSProperties>"

start_idx = src.find(start_marker)
end_idx = src.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("MISS: Could not find PartnerDialog boundaries")
else:
    src = src[:start_idx] + src[end_idx:]
    print("OK: Removed local PartnerDialog function")

# 3. Remove ds const (it's now in PartnerDialog.tsx)
ds_marker = "\nconst ds: Record<string, React.CSSProperties>"
ds_idx = src.find(ds_marker)
if ds_idx == -1:
    print("MISS: ds const not found (may already be removed)")
else:
    src = src[:ds_idx]
    print("OK: Removed local ds const")

if src == original:
    print("\nWARNING: No changes applied.")
else:
    print(f"\nRefactor applied successfully.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Saved to {path}")
