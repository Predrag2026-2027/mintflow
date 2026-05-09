#!/usr/bin/env python3
"""Fix: remove unused creatingPartner state"""
import sys, os

path = 'src/components/BulkImport.tsx'
if not os.path.exists(path):
    print(f"ERROR: {path} not found."); sys.exit(1)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src

src = src.replace(
    "  const [creatingPartner, setCreatingPartner] = useState<Record<string, boolean>>({})\n",
    "",
    1
)

if src == original:
    print("MISS: creatingPartner state not found")
else:
    print("OK: removed creatingPartner state")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print("Saved.")
