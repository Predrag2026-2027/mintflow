#!/usr/bin/env python3
"""Add inline category creation to BankStatementDialog."""
import sys, os

path = 'src/components/BankStatementDialog.tsx'
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
    """                                  <div style={s.field}>
                                    <label style={s.lbl}>P&L Category</label>
                                    <select style={s.select} value={row.pl_category_id}
                                      onChange={e => { const c = plCategories.find(x => x.id === e.target.value); updateRow(row.id, { pl_category_id: e.target.value, pl_category_name: c?.name || '', pl_subcategory_id: '', pl_subcategory_name: '' }) }}>
                                      <option value="">Select category...</option>
                                      {plCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                  </div>""",
    """                                  <div style={s.field}>
                                    <label style={s.lbl}>P&L Category</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                      <select style={{ ...s.select, flex: 1 }} value={row.pl_category_id}
                                        onChange={e => { const c = plCategories.find(x => x.id === e.target.value); updateRow(row.id, { pl_category_id: e.target.value, pl_category_name: c?.name || '', pl_subcategory_id: '', pl_subcategory_name: '' }) }}>
                                        <option value="">Select category...</option>
                                        {plCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                      </select>
                                      <InlineCategoryAdd table="pl_categories" currentCount={plCategories.length} theme="light"
                                        onAdded={item => { setPlCategories(prev => [...prev, { ...item, type: 'expense', sort_order: prev.length + 1 }]); updateRow(row.id, { pl_category_id: item.id, pl_category_name: item.name, pl_subcategory_id: '', pl_subcategory_name: '' }) }} />
                                    </div>
                                  </div>""",
    "P&L Category"
)

# 3. P&L Sub-category
src = replace_once(src,
    """                                  <div style={s.field}>
                                    <label style={s.lbl}>P&L Sub-category</label>
                                    <select style={s.select} value={row.pl_subcategory_id}
                                      onChange={e => { const sub = plSubcategories.find(x => x.id === e.target.value); updateRow(row.id, { pl_subcategory_id: e.target.value, pl_subcategory_name: sub?.name || '' }) }}
                                      disabled={!row.pl_category_id || plSubs.length === 0}>
                                      <option value="">Select sub-category...</option>
                                      {plSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                    </select>
                                  </div>""",
    """                                  <div style={s.field}>
                                    <label style={s.lbl}>P&L Sub-category</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                      <select style={{ ...s.select, flex: 1 }} value={row.pl_subcategory_id}
                                        onChange={e => { const sub = plSubcategories.find(x => x.id === e.target.value); updateRow(row.id, { pl_subcategory_id: e.target.value, pl_subcategory_name: sub?.name || '' }) }}
                                        disabled={!row.pl_category_id}>
                                        <option value="">Select sub-category...</option>
                                        {plSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                      </select>
                                      <InlineCategoryAdd table="pl_subcategories" parentId={row.pl_category_id} parentField="category_id"
                                        currentCount={plSubs.length} theme="light" disabled={!row.pl_category_id}
                                        onAdded={item => { setPlSubcategories(prev => [...prev, { ...item, category_id: row.pl_category_id, sort_order: prev.length + 1 }]); updateRow(row.id, { pl_subcategory_id: item.id, pl_subcategory_name: item.name }) }} />
                                    </div>
                                  </div>""",
    "P&L Sub-category"
)

# 4. Department
src = replace_once(src,
    """                                  <div style={s.field}>
                                    <label style={s.lbl}>Department</label>
                                    <select style={s.select} value={row.department_id}
                                      onChange={e => { const d = departments.find(x => x.id === e.target.value); updateRow(row.id, { department_id: e.target.value, department_name: d?.name || '', dept_subcategory_id: '', dept_subcategory_name: '', expense_description: '' }) }}>
                                      <option value="">Select department...</option>
                                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                  </div>""",
    """                                  <div style={s.field}>
                                    <label style={s.lbl}>Department</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                      <select style={{ ...s.select, flex: 1 }} value={row.department_id}
                                        onChange={e => { const d = departments.find(x => x.id === e.target.value); updateRow(row.id, { department_id: e.target.value, department_name: d?.name || '', dept_subcategory_id: '', dept_subcategory_name: '', expense_description: '' }) }}>
                                        <option value="">Select department...</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                      </select>
                                      <InlineCategoryAdd table="departments" currentCount={departments.length} theme="light"
                                        onAdded={item => { setDepartments(prev => [...prev, { ...item, sort_order: prev.length + 1 }]); updateRow(row.id, { department_id: item.id, department_name: item.name, dept_subcategory_id: '', dept_subcategory_name: '', expense_description: '' }) }} />
                                    </div>
                                  </div>""",
    "Department"
)

# 5. Dept Sub-category
src = replace_once(src,
    """                                  <div style={s.field}>
                                    <label style={s.lbl}>Dept. Sub-category</label>
                                    <select style={s.select} value={row.dept_subcategory_id}
                                      onChange={e => { const sub = deptSubcategories.find(x => x.id === e.target.value); updateRow(row.id, { dept_subcategory_id: e.target.value, dept_subcategory_name: sub?.name || '', expense_description: '' }) }}
                                      disabled={!row.department_id || deptSubs.length === 0}>
                                      <option value="">Select sub-category...</option>
                                      {deptSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                    </select>
                                  </div>""",
    """                                  <div style={s.field}>
                                    <label style={s.lbl}>Dept. Sub-category</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                      <select style={{ ...s.select, flex: 1 }} value={row.dept_subcategory_id}
                                        onChange={e => { const sub = deptSubcategories.find(x => x.id === e.target.value); updateRow(row.id, { dept_subcategory_id: e.target.value, dept_subcategory_name: sub?.name || '', expense_description: '' }) }}
                                        disabled={!row.department_id}>
                                        <option value="">Select sub-category...</option>
                                        {deptSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                      </select>
                                      <InlineCategoryAdd table="dept_subcategories" parentId={row.department_id} parentField="department_id"
                                        currentCount={deptSubs.length} theme="light" disabled={!row.department_id}
                                        onAdded={item => { setDeptSubcategories(prev => [...prev, { ...item, department_id: row.department_id, sort_order: prev.length + 1 }]); updateRow(row.id, { dept_subcategory_id: item.id, dept_subcategory_name: item.name, expense_description: '' }) }} />
                                    </div>
                                  </div>""",
    "Dept Sub-category"
)

# 6. Expense description
src = replace_once(src,
    """                                <div style={{ marginBottom: '10px' }}>
                                  <div style={s.field}>
                                    <label style={s.lbl}>Expense description</label>
                                    {expDescs.length > 0 ? (
                                      <select style={s.select} value={row.expense_description} onChange={e => updateRow(row.id, { expense_description: e.target.value })}>
                                        <option value="">Select description...</option>
                                        {expDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                      </select>
                                    ) : (
                                      <input style={s.input} value={row.expense_description} onChange={e => updateRow(row.id, { expense_description: e.target.value })} placeholder="e.g. AWS, Telekom, Rent..." />
                                    )}
                                  </div>
                                </div>""",
    """                                <div style={{ marginBottom: '10px' }}>
                                  <div style={s.field}>
                                    <label style={s.lbl}>Expense description</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                      {expDescs.length > 0 ? (
                                        <select style={{ ...s.select, flex: 1 }} value={row.expense_description} onChange={e => updateRow(row.id, { expense_description: e.target.value })}>
                                          <option value="">Select description...</option>
                                          {expDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                        </select>
                                      ) : (
                                        <input style={{ ...s.input, flex: 1 }} value={row.expense_description} onChange={e => updateRow(row.id, { expense_description: e.target.value })} placeholder="e.g. AWS, Telekom, Rent..." />
                                      )}
                                      <InlineCategoryAdd table="expense_descriptions" parentId={row.dept_subcategory_id} parentField="dept_subcategory_id"
                                        currentCount={expDescs.length} theme="light" disabled={!row.dept_subcategory_id}
                                        onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: row.dept_subcategory_id, sort_order: prev.length + 1 }]); updateRow(row.id, { expense_description: item.name }) }} />
                                    </div>
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
