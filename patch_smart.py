#!/usr/bin/env python3
"""
Smart category patch - works regardless of indentation.
Run from project root: python3 patch_smart.py
"""
import sys, os, re

def add_inline_add_after_select(src, label_text, table, parent_id_expr, parent_field, count_expr, on_added_expr, disabled_expr=None):
    """
    Find a <select> that follows a label containing label_text,
    and wrap it with InlineCategoryAdd.
    """
    # Find the label line
    lines = src.split('\n')
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Match the label
        if f'>{label_text}<' in stripped or f'>{label_text} ' in stripped or stripped.endswith(f'>{label_text}</label>'):
            indent = len(line) - len(line.lstrip())
            ind = ' ' * indent
            
            # Find the next <select or <input after this line
            for j in range(i+1, min(i+10, len(lines))):
                next_stripped = lines[j].strip()
                if next_stripped.startswith('<select') or next_stripped.startswith('{currentExpDescs') or next_stripped.startswith('{expDescs'):
                    # Check if already wrapped
                    if j > 0 and 'InlineCategoryAdd' in lines[j-1]:
                        print(f"  SKIP (already patched): {label_text}")
                        return src
                    
                    # Find the closing tag of this field container
                    # Insert wrapper div before the select/input
                    # Find where the select/input block ends
                    # Simple approach: look for the closing </div> of the field
                    
                    # Insert opening wrapper div before the select
                    select_indent = len(lines[j]) - len(lines[j].lstrip())
                    s_ind = ' ' * select_indent
                    
                    disabled_attr = f' disabled={{{disabled_expr}}}' if disabled_expr else ''
                    
                    inline_add = f"""{s_ind}<InlineCategoryAdd table="{table}"{' parentId={' + parent_id_expr + '}' if parent_id_expr else ''}{' parentField="' + parent_field + '"' if parent_field else ''}
{s_ind}  currentCount={{{count_expr}}} theme="light"{disabled_attr}
{s_ind}  onAdded={{{on_added_expr}}} />"""
                    
                    # Wrap: add opening flex div before, InlineCategoryAdd after select block
                    # Find end of select block (closing </select> or end of ternary)
                    # For now, find the next closing </div> at same indent level
                    
                    # Insert flex wrapper
                    wrapper_open = f"{s_ind}<div style={{{{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}}}>"
                    
                    # Find the end of the select element
                    depth = 0
                    end_line = j
                    for k in range(j, min(j+30, len(lines))):
                        l = lines[k].strip()
                        if l.startswith('<select') or l.startswith('{'):
                            depth += 1
                        if l.endswith('</select>') or (l.startswith('}') and depth > 0):
                            depth -= 1
                            if depth <= 0:
                                end_line = k
                                break
                        if 'disabled={' in l and depth == 1:
                            pass
                        if l == ')' and depth > 0:
                            depth -= 1
                            if depth <= 0:
                                end_line = k
                                break
                    
                    # Simpler: just modify the select to add flex: 1, and insert wrapper + InlineCategoryAdd
                    # Modify the select line to add flex:1 to its style
                    select_line = lines[j]
                    if 'style={s.select}' in select_line:
                        lines[j] = select_line.replace('style={s.select}', 'style={{ ...s.select, flex: 1 }}')
                    elif 'style={s.input}' in select_line:
                        lines[j] = select_line.replace('style={s.input}', 'style={{ ...s.input, flex: 1 }}')
                    
                    # Insert wrapper before select
                    lines.insert(j, wrapper_open)
                    
                    # Find new end_line after insertion
                    end_line += 1
                    
                    # Find the closing tag after select (look for </select> or closing brace)
                    for k in range(j+1, min(j+40, len(lines))):
                        l = lines[k].strip()
                        if l == '</select>' or l.endswith('</select>'):
                            end_line = k
                            break
                        if l.startswith(')}') and 'select' not in l:
                            end_line = k - 1
                            break
                    
                    # Insert closing div + InlineCategoryAdd after the select
                    close_wrapper = f"{s_ind}</div>"
                    lines.insert(end_line + 1, close_wrapper)
                    lines.insert(end_line + 1, inline_add)
                    
                    print(f"  OK: {label_text} (line {i+1}, select at {j+1})")
                    return '\n'.join(lines)
            
            print(f"  NO SELECT FOUND after: {label_text}")
            return src
    
    print(f"  LABEL NOT FOUND: {label_text}")
    return src


def patch_file(path, patches):
    if not os.path.exists(path):
        print(f"ERROR: {path} not found"); return
    
    with open(path, 'r', encoding='utf-8') as f:
        src = f.read()
    
    # Add import if needed
    if 'InlineCategoryAdd' not in src:
        src = src.replace(
            "import { supabase } from '../supabase'",
            "import { supabase } from '../supabase'\nimport InlineCategoryAdd from './InlineCategoryAdd'",
            1
        )
        if 'InlineCategoryAdd' in src:
            print("  OK: import added")
        else:
            print("  MISS: import not added")
    else:
        print("  SKIP: import already present")
    
    original = src
    for p in patches:
        src = add_inline_add_after_select(src, **p)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    
    changed = src != original
    print(f"  {'SAVED' if changed else 'NO CHANGES'}: {path}\n")


# ── InvoiceDialog ─────────────────────────────────────────
print("=== InvoiceDialog.tsx ===")
patch_file('src/components/InvoiceDialog.tsx', [
    dict(label_text='P&L Category', table='pl_categories', parent_id_expr=None, parent_field=None,
         count_expr='plCategories.length',
         on_added_expr="item => { setPlCategories(prev => [...prev, { ...item, type: 'expense', sort_order: prev.length + 1 }]); setPlCatId(item.id); setPlCatName(item.name); setPlSubId(''); setPlSubName('') }"),
    dict(label_text='P&L Sub-category', table='pl_subcategories', parent_id_expr='plCatId', parent_field='category_id',
         count_expr='currentPlSubs.length', disabled_expr='!plCatId',
         on_added_expr="item => { setPlSubcategories(prev => [...prev, { ...item, category_id: plCatId, sort_order: prev.length + 1 }]); setPlSubId(item.id); setPlSubName(item.name) }"),
    dict(label_text='Department', table='departments', parent_id_expr=None, parent_field=None,
         count_expr='departments.length',
         on_added_expr="item => { setDepartments(prev => [...prev, { ...item, sort_order: prev.length + 1 }]); setDeptId(item.id); setDeptName(item.name); setDeptSubId(''); setDeptSubName(''); setExpDesc('') }"),
    dict(label_text='Dept. sub-category', table='dept_subcategories', parent_id_expr='deptId', parent_field='department_id',
         count_expr='currentDeptSubs.length', disabled_expr='!deptId',
         on_added_expr="item => { setDeptSubcategories(prev => [...prev, { ...item, department_id: deptId, sort_order: prev.length + 1 }]); setDeptSubId(item.id); setDeptSubName(item.name); setExpDesc('') }"),
    dict(label_text='Expense description', table='expense_descriptions', parent_id_expr='deptSubId', parent_field='dept_subcategory_id',
         count_expr='currentExpDescs.length', disabled_expr='!deptSubId',
         on_added_expr="item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: deptSubId, sort_order: prev.length + 1 }]); setExpDesc(item.name) }"),
])

# ── TransactionDialog ──────────────────────────────────────
print("=== TransactionDialog.tsx ===")
patch_file('src/components/TransactionDialog.tsx', [
    dict(label_text='P&L Category', table='pl_categories', parent_id_expr=None, parent_field=None,
         count_expr='plCategories.length',
         on_added_expr="item => { setPlCategories(prev => [...prev, { ...item, type: 'expense', sort_order: prev.length + 1 }]); setPlCatId(item.id); setPlCatName(item.name); setPlSubId(''); setPlSubName('') }"),
    dict(label_text='P&L Sub-category', table='pl_subcategories', parent_id_expr='plCatId', parent_field='category_id',
         count_expr='currentPlSubs.length', disabled_expr='!plCatId',
         on_added_expr="item => { setPlSubcategories(prev => [...prev, { ...item, category_id: plCatId, sort_order: prev.length + 1 }]); setPlSubId(item.id); setPlSubName(item.name) }"),
    dict(label_text='Department', table='departments', parent_id_expr=None, parent_field=None,
         count_expr='departments.length',
         on_added_expr="item => { setDepartments(prev => [...prev, { ...item, sort_order: prev.length + 1 }]); setDeptId(item.id); setDeptName(item.name); setDeptSubId(''); setDeptSubName(''); setExpDesc('') }"),
    dict(label_text='Dept. sub-category', table='dept_subcategories', parent_id_expr='deptId', parent_field='department_id',
         count_expr='currentDeptSubs.length', disabled_expr='!deptId',
         on_added_expr="item => { setDeptSubcategories(prev => [...prev, { ...item, department_id: deptId, sort_order: prev.length + 1 }]); setDeptSubId(item.id); setDeptSubName(item.name); setExpDesc('') }"),
    dict(label_text='Expense description', table='expense_descriptions', parent_id_expr='deptSubId', parent_field='dept_subcategory_id',
         count_expr='currentExpDescs.length', disabled_expr='!deptSubId',
         on_added_expr="item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: deptSubId, sort_order: prev.length + 1 }]); setExpDesc(item.name) }"),
])

# ── BankStatementDialog ────────────────────────────────────
print("=== BankStatementDialog.tsx ===")
patch_file('src/components/BankStatementDialog.tsx', [
    dict(label_text='P&L Category', table='pl_categories', parent_id_expr=None, parent_field=None,
         count_expr='plCategories.length',
         on_added_expr="item => { setPlCategories(prev => [...prev, { ...item, type: 'expense', sort_order: prev.length + 1 }]); updateRow(row.id, { pl_category_id: item.id, pl_category_name: item.name, pl_subcategory_id: '', pl_subcategory_name: '' }) }"),
    dict(label_text='P&L Sub-category', table='pl_subcategories', parent_id_expr='row.pl_category_id', parent_field='category_id',
         count_expr='plSubs.length', disabled_expr='!row.pl_category_id',
         on_added_expr="item => { setPlSubcategories(prev => [...prev, { ...item, category_id: row.pl_category_id, sort_order: prev.length + 1 }]); updateRow(row.id, { pl_subcategory_id: item.id, pl_subcategory_name: item.name }) }"),
    dict(label_text='Department', table='departments', parent_id_expr=None, parent_field=None,
         count_expr='departments.length',
         on_added_expr="item => { setDepartments(prev => [...prev, { ...item, sort_order: prev.length + 1 }]); updateRow(row.id, { department_id: item.id, department_name: item.name, dept_subcategory_id: '', dept_subcategory_name: '', expense_description: '' }) }"),
    dict(label_text='Dept. Sub-category', table='dept_subcategories', parent_id_expr='row.department_id', parent_field='department_id',
         count_expr='deptSubs.length', disabled_expr='!row.department_id',
         on_added_expr="item => { setDeptSubcategories(prev => [...prev, { ...item, department_id: row.department_id, sort_order: prev.length + 1 }]); updateRow(row.id, { dept_subcategory_id: item.id, dept_subcategory_name: item.name, expense_description: '' }) }"),
    dict(label_text='Expense description', table='expense_descriptions', parent_id_expr='row.dept_subcategory_id', parent_field='dept_subcategory_id',
         count_expr='expDescs.length', disabled_expr='!row.dept_subcategory_id',
         on_added_expr="item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: row.dept_subcategory_id, sort_order: prev.length + 1 }]); updateRow(row.id, { expense_description: item.name }) }"),
])

# ── BulkImport ─────────────────────────────────────────────
print("=== BulkImport.tsx ===")
patch_file('src/components/BulkImport.tsx', [
    dict(label_text='P&L Category', table='pl_categories', parent_id_expr=None, parent_field=None,
         count_expr='plCategories.length',
         on_added_expr="item => { setPlCategories(prev => [...prev, { ...item, type: 'expense', sort_order: prev.length + 1 }]); updateRow(p.id, { override_pl_category_id: item.id, override_pl_category_name: item.name, override_pl_subcategory_id: '', override_pl_subcategory_name: '' }) }"),
    dict(label_text='P&L Sub-category', table='pl_subcategories', parent_id_expr='row.override_pl_category_id', parent_field='category_id',
         count_expr='plSubs.length', disabled_expr='!row.override_pl_category_id',
         on_added_expr="item => { setPlSubcategories(prev => [...prev, { ...item, category_id: row.override_pl_category_id, sort_order: prev.length + 1 }]); updateRow(p.id, { override_pl_subcategory_id: item.id, override_pl_subcategory_name: item.name }) }"),
    dict(label_text='Department', table='departments', parent_id_expr=None, parent_field=None,
         count_expr='departments.length',
         on_added_expr="item => { setDepartments(prev => [...prev, { ...item, sort_order: prev.length + 1 }]); updateRow(p.id, { override_department_id: item.id, override_department_name: item.name, override_dept_subcategory_id: '', override_dept_subcategory_name: '', override_expense_description: '' }) }"),
    dict(label_text='Dept. Sub-category', table='dept_subcategories', parent_id_expr='row.override_department_id', parent_field='department_id',
         count_expr='deptSubs.length', disabled_expr='!row.override_department_id',
         on_added_expr="item => { setDeptSubcategories(prev => [...prev, { ...item, department_id: row.override_department_id, sort_order: prev.length + 1 }]); updateRow(p.id, { override_dept_subcategory_id: item.id, override_dept_subcategory_name: item.name, override_expense_description: '' }) }"),
    dict(label_text='Expense description', table='expense_descriptions', parent_id_expr='row.override_dept_subcategory_id', parent_field='dept_subcategory_id',
         count_expr='expDescs.length', disabled_expr='!row.override_dept_subcategory_id',
         on_added_expr="item => { setExpenseDescriptions(prev => [...prev, { ...item, dept_subcategory_id: row.override_dept_subcategory_id, sort_order: prev.length + 1 }]); updateRow(p.id, { override_expense_description: item.name }) }"),
])

print("Done!")
