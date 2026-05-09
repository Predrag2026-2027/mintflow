#!/usr/bin/env python3
"""
Fix broken JSX in expense description fields across all 4 dialog components.
The patch incorrectly placed InlineCategoryAdd inside the ternary expression.
Run from project root: python3 fix_expense_desc.py
"""
import os, sys

changes_total = 0

def fix_file(path, broken, fixed, label):
    global changes_total
    if not os.path.exists(path):
        print(f"  ERROR: {path} not found"); return
    with open(path, 'r', encoding='utf-8') as f:
        src = f.read()
    if broken not in src:
        print(f"  SKIP (not found): {label} in {path}")
        return
    src = src.replace(broken, fixed, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    changes_total += 1
    print(f"  OK: {label} in {path}")

# ── InvoiceDialog ───────────────────────────────────────────────────────────
fix_file(
    'src/components/InvoiceDialog.tsx',
    '''                    <div style={s.field}>
                      <label style={s.lbl}>Expense description</label>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                      {currentExpDescs.length > 0 ? (
                        <select style={s.select} value={expDesc} onChange={e => setExpDesc(e.target.value)}>
                          <option value="">Select description...</option>
                          {currentExpDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                        </select>
                      <InlineCategoryAdd table="expense_descriptions" parentId={deptSubId} parentField="dept_subcategory_id"
                        currentCount={currentExpDescs.length} theme="light" disabled={!deptSubId}
                        onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: deptSubId, sort_order: prev.length + 1 }]); setExpDesc(item.name) }} />
                      </div>
                      ) : (
                        <input style={s.input} value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Enter expense description..." />
                      )}
                    </div>''',
    '''                    <div style={s.field}>
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
                        <InlineCategoryAdd table="expense_descriptions" parentId={deptSubId} parentField="dept_subcategory_id"
                          currentCount={currentExpDescs.length} theme="light" disabled={!deptSubId}
                          onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: deptSubId, sort_order: prev.length + 1 }]); setExpDesc(item.name) }} />
                      </div>
                    </div>''',
    'expense description'
)

# ── TransactionDialog ───────────────────────────────────────────────────────
fix_file(
    'src/components/TransactionDialog.tsx',
    '''                        <div style={s.field}>
                          <label style={s.lbl}>Expense description</label>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                          {currentExpDescs.length > 0 ? (
                            <select style={s.select} value={expDesc} onChange={e => setExpDesc(e.target.value)}>
                              <option value="">Select description...</option>
                              {currentExpDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                            </select>
                          <InlineCategoryAdd table="expense_descriptions" parentId={deptSubId} parentField="dept_subcategory_id"
                            currentCount={currentExpDescs.length} theme="light" disabled={!deptSubId}
                            onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: deptSubId, sort_order: prev.length + 1 }]); setExpDesc(item.name) }} />
                          </div>
                          ) : (
                            <input style={s.input} value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Enter expense description..." />
                          )}
                        </div>''',
    '''                        <div style={s.field}>
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
                            <InlineCategoryAdd table="expense_descriptions" parentId={deptSubId} parentField="dept_subcategory_id"
                              currentCount={currentExpDescs.length} theme="light" disabled={!deptSubId}
                              onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: deptSubId, sort_order: prev.length + 1 }]); setExpDesc(item.name) }} />
                          </div>
                        </div>''',
    'expense description'
)

# ── BankStatementDialog ─────────────────────────────────────────────────────
fix_file(
    'src/components/BankStatementDialog.tsx',
    '''                                <div style={{ marginBottom: '10px' }}>
                                  <div style={s.field}>
                                    <label style={s.lbl}>Expense description</label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                    {expDescs.length > 0 ? (
                                      <select style={s.select} value={row.expense_description} onChange={e => updateRow(row.id, { expense_description: e.target.value })}>
                                        <option value="">Select description...</option>
                                        {expDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                      </select>
                                    <InlineCategoryAdd table="expense_descriptions" parentId={row.dept_subcategory_id} parentField="dept_subcategory_id"
                                      currentCount={expDescs.length} theme="light" disabled={!row.dept_subcategory_id}
                                      onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: row.dept_subcategory_id, sort_order: prev.length + 1 }]); updateRow(row.id, { expense_description: item.name }) }} />
                                    </div>
                                    ) : (
                                      <input style={s.input} value={row.expense_description} onChange={e => updateRow(row.id, { expense_description: e.target.value })} placeholder="e.g. AWS, Telekom, Rent..." />
                                    )}
                                  </div>
                                </div>''',
    '''                                <div style={{ marginBottom: '10px' }}>
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
                                </div>''',
    'expense description'
)

# ── BulkImport ──────────────────────────────────────────────────────────────
fix_file(
    'src/components/BulkImport.tsx',
    '''                              <div style={{ marginTop: '8px' }}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Expense description</label>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                  {expDescs.length > 0 ? (
                                    <select style={s.editSelect} value={row.override_expense_description} onChange={e => updateRow(p.id, { override_expense_description: e.target.value })}>
                                      <option value="">Select description...</option>
                                      {expDescs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                    </select>
                                  <InlineCategoryAdd table="expense_descriptions" parentId={row.override_dept_subcategory_id} parentField="dept_subcategory_id"
                                    currentCount={expDescs.length} theme="light" disabled={!row.override_dept_subcategory_id}
                                    onAdded={item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: row.override_dept_subcategory_id, sort_order: prev.length + 1 }]); updateRow(p.id, { override_expense_description: item.name }) }} />
                                  </div>
                                  ) : (
                                    <input style={s.editInput} value={row.override_expense_description} onChange={e => updateRow(p.id, { override_expense_description: e.target.value })} placeholder="e.g. Telekom, AWS, Rent..." />
                                  )}
                                </div>
                              </div>''',
    '''                              <div style={{ marginTop: '8px' }}>
                                <div style={s.editField}>
                                  <label style={s.editLbl}>Expense description</label>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
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
                              </div>''',
    'expense description'
)

print(f"\nTotal fixes applied: {changes_total}")
