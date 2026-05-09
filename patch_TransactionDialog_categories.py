#!/usr/bin/env python3
"""Add inline category creation to TransactionDialog."""
import sys, os

path = 'src/components/TransactionDialog.tsx'
if not os.path.exists(path):
    print(f"ERROR: {path} not found."); sys.exit(1)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src
changes = 0

def replace_once(src, old, new, label):
    global changes
    if old not in src:
        print(f"  MISS: {label}")
        return src
    changes += 1
    print(f"  OK:   {label}")
    return src.replace(old, new, 1)

# 1. Import
src = replace_once(src,
    "import { supabase } from '../supabase'",
    "import { supabase } from '../supabase'\nimport InlineCategoryAdd from './InlineCategoryAdd'",
    "import"
)

# 2. P&L Category
src = replace_once(src,
    """                          <div style={s.field}>
                            <label style={s.lbl}>P&L Category <span style={s.req}>*</span></label>
                            <select style={{ ...s.select, ...(fieldErr('plCat') ? s.inputError : {}) }} value={plCatId}
                              onChange={e => { const cat = plCategories.find(c => c.id === e.target.value); setPlCatId(e.target.value); setPlCatName(cat?.name || ''); setPlSubId(''); setPlSubName(''); touch('plCat') }}
                              onBlur={() => touch('plCat')}>
                              <option value="">Select P&L category...</option>
                              {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {fieldErr('plCat') && <span style={s.errorMsg}>{fieldErr('plCat')}</span>}
                          </div>""",
    """                          <div style={s.field}>
                            <label style={s.lbl}>P&L Category <span style={s.req}>*</span></label>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                              <select style={{ ...s.select, flex: 1, ...(fieldErr('plCat') ? s.inputError : {}) }} value={plCatId}
                                onChange={e => { const cat = plCategories.find(c => c.id === e.target.value); setPlCatId(e.target.value); setPlCatName(cat?.name || ''); setPlSubId(''); setPlSubName(''); touch('plCat') }}
                                onBlur={() => touch('plCat')}>
                                <option value="">Select P&L category...</option>
                                {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              <InlineCategoryAdd
                                table="pl_categories" currentCount={plCategories.length} theme="light"
                                onAdded={item => { setPlCategories(prev => [...prev, { ...item, type: 'expense', sort_order: prev.length + 1 }]); setPlCatId(item.id); setPlCatName(item.name); setPlSubId(''); setPlSubName('') }}
                              />
                            </div>
                            {fieldErr('plCat') && <span style={s.errorMsg}>{fieldErr('plCat')}</span>}
                          </div>""",
    "P&L Category"
)

# 3. P&L Sub-category
src = replace_once(src,
    """                          <div style={s.field}>
                            <label style={s.lbl}>P&L Sub-category</label>
                            <select style={s.select} value={plSubId}
                              onChange={e => { const sub = plSubcategories.find(s => s.id === e.target.value); setPlSubId(e.target.value); setPlSubName(sub?.name || '') }}
                              disabled={!plCatId || currentPlSubs.length === 0}>
                              <option value="">Select sub-category...</option>
                              {currentPlSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                            </select>
                          </div>""",
    """                          <div style={s.field}>
                            <label style={s.lbl}>P&L Sub-category</label>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                              <select style={{ ...s.select, flex: 1 }} value={plSubId}
                                onChange={e => { const sub = plSubcategories.find(s => s.id === e.target.value); setPlSubId(e.target.value); setPlSubName(sub?.name || '') }}
                                disabled={!plCatId}>
                                <option value="">Select sub-category...</option>
                                {currentPlSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                              </select>
                              <InlineCategoryAdd
                                table="pl_subcategories" parentId={plCatId} parentField="category_id"
                                currentCount={currentPlSubs.length} theme="light" disabled={!plCatId}
                                onAdded={item => { setPlSubcategories(prev => [...prev, { ...item, category_id: plCatId, sort_order: prev.length + 1 }]); setPlSubId(item.id); setPlSubName(item.name) }}
                              />
                            </div>
                          </div>""",
    "P&L Sub-category"
)

# 4. Department
src = replace_once(src,
    """                          <div style={s.field}>
                            <label style={s.lbl}>Department <span style={s.req}>*</span></label>
                            <select style={{ ...s.select, ...(fieldErr('dept') ? s.inputError : {}) }} value={deptId}
                              onChange={e => { const dept = departments.find(d => d.id === e.target.value); setDeptId(e.target.value); setDeptName(dept?.name || ''); setDeptSubId(''); setDeptSubName(''); setExpDesc(''); touch('dept') }}
                              onBlur={() => touch('dept')}>
                              <option value="">Select department...</option>
                              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            {fieldErr('dept') && <span style={s.errorMsg}>{fieldErr('dept')}</span>}
                          </div>""",
    """                          <div style={s.field}>
                            <label style={s.lbl}>Department <span style={s.req}>*</span></label>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                              <select style={{ ...s.select, flex: 1, ...(fieldErr('dept') ? s.inputError : {}) }} value={deptId}
                                onChange={e => { const dept = departments.find(d => d.id === e.target.value); setDeptId(e.target.value); setDeptName(dept?.name || ''); setDeptSubId(''); setDeptSubName(''); setExpDesc(''); touch('dept') }}
                                onBlur={() => touch('dept')}>
                                <option value="">Select department...</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                              <InlineCategoryAdd
                                table="departments" currentCount={departments.length} theme="light"
                                onAdded={item => { setDepartments(prev => [...prev, { ...item, sort_order: prev.length + 1 }]); setDeptId(item.id); setDeptName(item.name); setDeptSubId(''); setDeptSubName(''); setExpDesc('') }}
                              />
                            </div>
                            {fieldErr('dept') && <span style={s.errorMsg}>{fieldErr('dept')}</span>}
                          </div>""",
    "Department"
)

# 5. Dept Sub-category
src = replace_once(src,
    """                          <div style={s.field}>
                            <label style={s.lbl}>Dept. sub-category</label>
                            <select style={s.select} value={deptSubId}
                              onChange={e => { const sub = deptSubcategories.find(s => s.id === e.target.value); setDeptSubId(e.target.value); setDeptSubName(sub?.name || ''); setExpDesc('') }}
                              disabled={!deptId || currentDeptSubs.length === 0}>
                              <option value="">Select sub-category...</option>
                              {currentDeptSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                            </select>
                          </div>""",
    """                          <div style={s.field}>
                            <label style={s.lbl}>Dept. sub-category</label>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                              <select style={{ ...s.select, flex: 1 }} value={deptSubId}
                                onChange={e => { const sub = deptSubcategories.find(s => s.id === e.target.value); setDeptSubId(e.target.value); setDeptSubName(sub?.name || ''); setExpDesc('') }}
                                disabled={!deptId}>
                                <option value="">Select sub-category...</option>
                                {currentDeptSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                              </select>
                              <InlineCategoryAdd
                                table="dept_subcategories" parentId={deptId} parentField="department_id"
                                currentCount={currentDeptSubs.length} theme="light" disabled={!deptId}
                                onAdded={item => { setDeptSubcategories(prev => [...prev, { ...item, department_id: deptId, sort_order: prev.length + 1 }]); setDeptSubId(item.id); setDeptSubName(item.name); setExpDesc('') }}
                              />
                            </div>
                          </div>""",
    "Dept Sub-category"
)

# 6. Expense description
src = replace_once(src,
    """                        <div style={s.field}>
                          <label style={s.lbl}>Expense description</label>
                          {currentExpDescs.length > 0 ? (
                            <select style={s.select} value={expDesc} onChange={e => setExpDesc(e.target.value)}>
                              <option value="">Select description...</option>
                              {currentExpDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                            </select>
                          ) : (
                            <input style={s.input} value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Enter expense description..." />
                          )}
                        </div>""",
    """                        <div style={s.field}>
                          <label style={s.lbl}>Expense description</label>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                            {currentExpDescs.length > 0 ? (
                              <select style={{ ...s.select, flex: 1 }} value={expDesc} onChange={e => setExpDesc(e.target.value)}>
                                <option value="">Select description...</option>
                                {currentExpDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                              </select>
                            ) : (
                              <input style={{ ...s.input, flex: 1 }} value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Enter expense description..." />
                            )}
                            <InlineCategoryAdd
                              table="expense_descriptions" parentId={deptSubId} parentField="dept_subcategory_id"
                              currentCount={currentExpDescs.length} theme="light" disabled={!deptSubId}
                              onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: deptSubId, sort_order: prev.length + 1 }]); setExpDesc(item.name) }}
                            />
                          </div>
                        </div>""",
    "Expense description"
)

if src == original:
    print("\nWARNING: No changes.")
else:
    print(f"\n{changes} patches applied.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Saved to {path}")
