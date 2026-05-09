#!/usr/bin/env python3
"""Add inline category creation to BulkImport review panel."""
import sys, os

path = 'src/components/BulkImport.tsx'
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
    "import PartnerDialog from './PartnerDialog'",
    "import PartnerDialog from './PartnerDialog'\nimport InlineCategoryAdd from './InlineCategoryAdd'",
    "import"
)

# 2. P&L Category in review panel
src = replace_once(src,
    """                                <div style={s.editField}>
                                  <label style={s.editLbl}>P&L Category</label>
                                  <select style={s.editSelect} value={row.override_pl_category_id}
                                    onChange={e => { const c = plCategories.find(x => x.id === e.target.value); updateRow(p.id, { override_pl_category_id: e.target.value, override_pl_category_name: c?.name || '', override_pl_subcategory_id: '', override_pl_subcategory_name: '' }) }}>
                                    <option value="">Select category...</option>
                                    {plCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </div>""",
    """                                <div style={s.editField}>
                                  <label style={s.editLbl}>P&L Category</label>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                                    <select style={{ ...s.editSelect, flex: 1 }} value={row.override_pl_category_id}
                                      onChange={e => { const c = plCategories.find(x => x.id === e.target.value); updateRow(p.id, { override_pl_category_id: e.target.value, override_pl_category_name: c?.name || '', override_pl_subcategory_id: '', override_pl_subcategory_name: '' }) }}>
                                      <option value="">Select category...</option>
                                      {plCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <InlineCategoryAdd table="pl_categories" currentCount={plCategories.length} theme="light"
                                      onAdded={item => { setPlCategories(prev => [...prev, { ...item, type: 'expense', sort_order: prev.length + 1 }]); updateRow(p.id, { override_pl_category_id: item.id, override_pl_category_name: item.name, override_pl_subcategory_id: '', override_pl_subcategory_name: '' }) }} />
                                  </div>
                                </div>""",
    "BulkImport P&L Category"
)

# 3. P&L Sub-category
src = replace_once(src,
    """                                <div style={s.editField}>
                                  <label style={s.editLbl}>P&L Sub-category</label>
                                  <select style={s.editSelect} value={row.override_pl_subcategory_id}
                                    onChange={e => { const sub = plSubcategories.find(x => x.id === e.target.value); updateRow(p.id, { override_pl_subcategory_id: e.target.value, override_pl_subcategory_name: sub?.name || '' }) }}
                                    disabled={!row.override_pl_category_id || plSubs.length === 0}>
                                    <option value="">Select sub-category...</option>
                                    {plSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                  </select>
                                </div>""",
    """                                <div style={s.editField}>
                                  <label style={s.editLbl}>P&L Sub-category</label>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                                    <select style={{ ...s.editSelect, flex: 1 }} value={row.override_pl_subcategory_id}
                                      onChange={e => { const sub = plSubcategories.find(x => x.id === e.target.value); updateRow(p.id, { override_pl_subcategory_id: e.target.value, override_pl_subcategory_name: sub?.name || '' }) }}
                                      disabled={!row.override_pl_category_id}>
                                      <option value="">Select sub-category...</option>
                                      {plSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                    </select>
                                    <InlineCategoryAdd table="pl_subcategories" parentId={row.override_pl_category_id} parentField="category_id"
                                      currentCount={plSubs.length} theme="light" disabled={!row.override_pl_category_id}
                                      onAdded={item => { setPlSubcategories(prev => [...prev, { ...item, category_id: row.override_pl_category_id, sort_order: prev.length + 1 }]); updateRow(p.id, { override_pl_subcategory_id: item.id, override_pl_subcategory_name: item.name }) }} />
                                  </div>
                                </div>""",
    "BulkImport P&L Sub-category"
)

# 4. Department
src = replace_once(src,
    """                                <div style={s.editField}>
                                  <label style={s.editLbl}>Department</label>
                                  <select style={s.editSelect} value={row.override_department_id}
                                    onChange={e => { const d = departments.find(x => x.id === e.target.value); updateRow(p.id, { override_department_id: e.target.value, override_department_name: d?.name || '', override_dept_subcategory_id: '', override_dept_subcategory_name: '', override_expense_description: '' }) }}>
                                    <option value="">Select department...</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select>
                                </div>""",
    """                                <div style={s.editField}>
                                  <label style={s.editLbl}>Department</label>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                                    <select style={{ ...s.editSelect, flex: 1 }} value={row.override_department_id}
                                      onChange={e => { const d = departments.find(x => x.id === e.target.value); updateRow(p.id, { override_department_id: e.target.value, override_department_name: d?.name || '', override_dept_subcategory_id: '', override_dept_subcategory_name: '', override_expense_description: '' }) }}>
                                      <option value="">Select department...</option>
                                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                    <InlineCategoryAdd table="departments" currentCount={departments.length} theme="light"
                                      onAdded={item => { setDepartments(prev => [...prev, { ...item, sort_order: prev.length + 1 }]); updateRow(p.id, { override_department_id: item.id, override_department_name: item.name, override_dept_subcategory_id: '', override_dept_subcategory_name: '', override_expense_description: '' }) }} />
                                  </div>
                                </div>""",
    "BulkImport Department"
)

# 5. Dept Sub-category
src = replace_once(src,
    """                                <div style={s.editField}>
                                  <label style={s.editLbl}>Dept. Sub-category</label>
                                  <select style={s.editSelect} value={row.override_dept_subcategory_id}
                                    onChange={e => { const sub = deptSubcategories.find(x => x.id === e.target.value); updateRow(p.id, { override_dept_subcategory_id: e.target.value, override_dept_subcategory_name: sub?.name || '', override_expense_description: '' }) }}
                                    disabled={!row.override_department_id || deptSubs.length === 0}>
                                    <option value="">Select sub-category...</option>
                                    {deptSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                  </select>
                                </div>""",
    """                                <div style={s.editField}>
                                  <label style={s.editLbl}>Dept. Sub-category</label>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                                    <select style={{ ...s.editSelect, flex: 1 }} value={row.override_dept_subcategory_id}
                                      onChange={e => { const sub = deptSubcategories.find(x => x.id === e.target.value); updateRow(p.id, { override_dept_subcategory_id: e.target.value, override_dept_subcategory_name: sub?.name || '', override_expense_description: '' }) }}
                                      disabled={!row.override_department_id}>
                                      <option value="">Select sub-category...</option>
                                      {deptSubs.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                    </select>
                                    <InlineCategoryAdd table="dept_subcategories" parentId={row.override_department_id} parentField="department_id"
                                      currentCount={deptSubs.length} theme="light" disabled={!row.override_department_id}
                                      onAdded={item => { setDeptSubcategories(prev => [...prev, { ...item, department_id: row.override_department_id, sort_order: prev.length + 1 }]); updateRow(p.id, { override_dept_subcategory_id: item.id, override_dept_subcategory_name: item.name, override_expense_description: '' }) }} />
                                  </div>
                                </div>""",
    "BulkImport Dept Sub-category"
)

# 6. Expense description
src = replace_once(src,
    """                              <div style={{ marginTop: '8px' }}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Expense description</label>
                                  {expDescs.length > 0 ? (
                                    <select style={s.editSelect} value={row.override_expense_description} onChange={e => updateRow(p.id, { override_expense_description: e.target.value })}>
                                      <option value="">Select description...</option>
                                      {expDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                    </select>
                                  ) : (
                                    <input style={s.editInput} value={row.override_expense_description} onChange={e => updateRow(p.id, { override_expense_description: e.target.value })} placeholder="e.g. Telekom, AWS, Rent..." />
                                  )}
                                </div>
                              </div>""",
    """                              <div style={{ marginTop: '8px' }}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Expense description</label>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                                    {expDescs.length > 0 ? (
                                      <select style={{ ...s.editSelect, flex: 1 }} value={row.override_expense_description} onChange={e => updateRow(p.id, { override_expense_description: e.target.value })}>
                                        <option value="">Select description...</option>
                                        {expDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                      </select>
                                    ) : (
                                      <input style={{ ...s.editInput, flex: 1 }} value={row.override_expense_description} onChange={e => updateRow(p.id, { override_expense_description: e.target.value })} placeholder="e.g. Telekom, AWS, Rent..." />
                                    )}
                                    <InlineCategoryAdd table="expense_descriptions" parentId={row.override_dept_subcategory_id} parentField="dept_subcategory_id"
                                      currentCount={expDescs.length} theme="light" disabled={!row.override_dept_subcategory_id}
                                      onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: row.override_dept_subcategory_id, sort_order: prev.length + 1 }]); updateRow(p.id, { override_expense_description: item.name }) }} />
                                  </div>
                                </div>
                              </div>""",
    "BulkImport Expense description"
)

if src == original:
    print("\nWARNING: No changes.")
else:
    print(f"\n{changes} patches applied.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"Saved to {path}")
