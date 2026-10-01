import { Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { useLocalDay } from '../hooks/useLocalDay';
import { localDate } from '../utils/date';

const defaultCategories = ['Food', 'Training', 'Transport', 'Rent', 'Software', 'Books', 'Health', 'Other'];
const emptyForm = () => ({ vendor: '', category: 'Food', amount: '', spent_on: '', notes: '' });

export function FinancesTab() {
  const {
    createExpense, deleteExpense, expenses, expensesError, expensesStatus,
    loadExpenseMonth, monthlyExpenses, monthlyExpensesError, monthlyExpensesStatus,
    reloadExpenses, updateExpense,
  } = useLifeOS();
  const today = useLocalDay();
  const [monthChoice, setMonthChoice] = useState(null);
  const selectedMonth = monthChoice || today.slice(0, 7);
  const range = useMemo(() => getMonthRange(selectedMonth), [selectedMonth]);
  const rows = useMemo(() => sortExpenses(monthlyExpenses.filter((row) => row.spent_on >= range.start && row.spent_on < range.end)), [monthlyExpenses, range]);
  const recent = useMemo(() => sortExpenses(expenses).filter((row) => row.spent_on < range.start || row.spent_on >= range.end).slice(0, 15), [expenses, range]);
  const categories = useMemo(() => Array.from(new Set([...defaultCategories, ...expenses.map((row) => row.category).filter(Boolean), ...rows.map((row) => row.category).filter(Boolean)])).sort(), [expenses, rows]);
  const categorySpend = useMemo(() => buildCategorySpend(rows), [rows]);
  const total = rows.reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => { loadExpenseMonth(range.start, range.end); }, [loadExpenseMonth, range]);
  const refresh = () => Promise.all([reloadExpenses(), loadExpenseMonth(range.start, range.end)]);
  const updateForm = (field, value) => { setForm((prev) => ({ ...prev, [field]: value })); setFormError(''); setSaved(false); };
  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const resolved = { ...form, spent_on: form.spent_on || today };
    const error = validateExpenseForm(resolved);
    if (error) { setFormError(error); return; }
    setSaving(true); setFormError(''); setSaved(false);
    try {
      await createExpense(toPayload(resolved));
      setForm({ ...emptyForm(), category: form.category });
      setSaved(true);
      await refresh();
    } catch (error) { setFormError(error.message || 'Failed to save expense.'); }
    finally { setSaving(false); }
  };
  const beginEdit = (row) => { setEditingId(row.id); setEditForm(formFromExpense(row)); setEditError(''); };
  const cancelEdit = () => { if (!savingEdit) { setEditingId(null); setEditForm(null); setEditError(''); } };
  const saveEdit = async (event) => {
    event.preventDefault();
    if (savingEdit) return;
    const error = validateExpenseForm(editForm);
    if (error) { setEditError(error); return; }
    setSavingEdit(true); setEditError('');
    try {
      await updateExpense(editingId, toPayload(editForm));
      setEditingId(null); setEditForm(null);
      await refresh();
    } catch (error) { setEditError(error.message || 'Failed to update expense.'); }
    finally { setSavingEdit(false); }
  };
  const remove = async (row) => {
    if (deletingId || savingEdit || !window.confirm('Delete expense "' + row.vendor + '" permanently?')) return;
    setDeletingId(row.id); setDeleteError('');
    try { await deleteExpense(row.id); await refresh(); }
    catch (error) { setDeleteError(error.message || 'Failed to delete expense.'); }
    finally { setDeletingId(null); }
  };
  const renderRow = (row) => editingId === row.id ? (
    <form key={row.id} aria-label={'Edit expense ' + row.vendor} onSubmit={saveEdit} className="grid gap-3 border-y border-white/15 py-4">
      <fieldset disabled={savingEdit} className="grid min-w-0 gap-3"><ExpenseFields form={editForm} categories={categories} listId="expense-edit-categories" onChange={(field, value) => { setEditForm((prev) => ({ ...prev, [field]: value })); setEditError(''); }} /></fieldset>
      {editError ? <p role="alert" className="text-sm text-red-300">{editError}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={savingEdit} className="primary-button inline-flex min-h-11 items-center gap-2 px-4 text-sm"><Save size={16} />{savingEdit ? 'Saving' : 'Save changes'}</button>
        <button type="button" disabled={savingEdit} onClick={cancelEdit} className="inline-flex min-h-11 items-center gap-2 px-4 text-sm text-zinc-300"><X size={16} />Cancel</button>
      </div>
    </form>
  ) : (
    <article key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 py-4">
      <div className="min-w-0">
        <h3 className="break-words text-sm font-semibold text-zinc-100">{row.vendor}</h3>
        <p className="mt-1 break-words text-xs text-zinc-400">{row.category || 'Other'} <span className="text-zinc-600">/</span> {row.spent_on}</p>
        {row.notes ? <p className="mt-2 break-words text-sm text-zinc-400">{row.notes}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className="data-text whitespace-nowrap text-base font-semibold text-zinc-200">EUR {formatMoney(row.amount)}</span>
        <div className="flex gap-1">
          <IconButton icon={Pencil} label="Edit expense" disabled={!!deletingId || savingEdit} onClick={() => beginEdit(row)} />
          <IconButton icon={deletingId === row.id ? Loader2 : Trash2} label="Delete expense" disabled={!!deletingId || savingEdit} onClick={() => remove(row)} />
        </div>
      </div>
    </article>
  );

  return (
    <div className="grid min-w-0 gap-6 pb-6">
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_144px] items-start gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">{formatMonthLabel(selectedMonth)}</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-100">Expense ledger</h2>
          {rows.length ? <p className="data-text mt-2 text-xl text-zinc-200">EUR {formatMoney(total)} <span className="font-sans text-xs text-zinc-500">/ {rows.length} {rows.length === 1 ? 'entry' : 'entries'}{monthlyExpensesStatus === 'loading' ? ' / refreshing' : ''}</span></p> : null}
        </div>
        <label className="grid gap-1 text-xs text-zinc-400">Month
          <input type="month" value={selectedMonth} onChange={(event) => { cancelEdit(); setMonthChoice(event.target.value || null); }} disabled={savingEdit} className="h-11 w-full min-w-0 rounded border border-white/10 bg-black/30 px-2 text-base text-zinc-100" />
        </label>
      </header>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-10">
        <section aria-label="Capture expense" className="min-w-0 border-t border-white/10 pt-4">
          <h3 className="mb-4 text-sm font-semibold text-zinc-200">Add expense</h3>
          <form onSubmit={submit} className="grid gap-3">
            <fieldset disabled={saving} className="grid min-w-0 gap-3"><ExpenseFields form={{ ...form, spent_on: form.spent_on || today }} categories={categories} onChange={updateForm} /></fieldset>
            {formError ? <p role="alert" className="text-sm text-red-300">{formError}</p> : null}
            <button type="submit" disabled={saving} className="primary-button inline-flex min-h-12 items-center justify-center gap-2 text-sm font-semibold">{saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{saving ? 'Saving expense' : 'Save expense'}</button>
            {saved ? <p role="status" className="text-sm text-zinc-300">Expense saved.</p> : null}
          </form>
        </section>
        <section aria-label="Selected month ledger" className="min-w-0 border-t border-white/10 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-200">{formatMonthLabel(selectedMonth)}</h3>
          {monthlyExpensesError ? <p role="alert" className="py-3 text-sm text-red-300">{monthlyExpensesError}</p> : null}
          {deleteError ? <p role="alert" className="py-3 text-sm text-red-300">{deleteError}</p> : null}
          <div className="divide-y divide-white/10">{rows.map(renderRow)}</div>
          {!rows.length ? monthlyExpensesStatus === 'loading' || monthlyExpensesStatus === 'idle' ? <LoadingRow /> : monthlyExpensesError ? <button type="button" onClick={() => loadExpenseMonth(range.start, range.end)} className="min-h-11 text-sm text-zinc-200">Retry month</button> : <p className="py-6 text-sm text-zinc-500">No expenses this month.</p> : null}
          {categorySpend.length ? (
            <details className="mt-6 border-t border-white/10 pt-2">
              <summary className="min-h-11 cursor-pointer py-3 text-sm text-zinc-300">Category breakdown</summary>
              <dl className="grid gap-4 py-3">{categorySpend.map(({ category, amount }) => (
                <div key={category}>
                  <div className="mb-2 flex justify-between gap-3 text-sm"><dt className="break-words text-zinc-400">{category}</dt><dd className="data-text shrink-0 text-zinc-200">EUR {formatMoney(amount)}</dd></div>
                  <div className="h-1 bg-white/5"><div className="h-full bg-zinc-500" style={{ width: (total ? amount / total * 100 : 0) + '%' }} /></div>
                </div>
              ))}</dl>
            </details>
          ) : null}
        </section>
      </div>
      <details className="border-t border-white/10 pt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-zinc-400">Recent expenses in other months</summary>
        {expensesError ? <p role="alert" className="py-3 text-sm text-red-300">{expensesError}</p> : null}
        <div className="divide-y divide-white/10">{recent.map(renderRow)}</div>
        {!recent.length ? expensesStatus === 'loading' ? <LoadingRow /> : expensesError ? <button type="button" onClick={reloadExpenses} className="min-h-11 text-sm text-zinc-200">Retry recent expenses</button> : <p className="py-4 text-sm text-zinc-500">No recent expenses outside this month.</p> : null}
      </details>
    </div>
  );
}

function ExpenseFields({ form, onChange, categories, listId = 'expense-categories' }) {
  return (
    <>
      <LedgerField label="Vendor" value={form.vendor} onChange={(value) => onChange('vendor', value)} />
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <LedgerField label="Amount" inputMode="decimal" value={form.amount} placeholder="0.00" onChange={(value) => onChange('amount', value)} />
        <LedgerField label="Date" type="date" value={form.spent_on} onChange={(value) => onChange('spent_on', value)} />
      </div>
      <label className="grid min-w-0 gap-1 text-xs text-zinc-400">Category
        <input list={listId} value={form.category} onChange={(event) => onChange('category', event.target.value)} className="h-11 min-w-0 rounded border border-white/10 bg-black/30 px-3 text-base text-zinc-100" />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-zinc-400">Notes
        <textarea value={form.notes} onChange={(event) => onChange('notes', event.target.value)} rows={2} className="min-h-16 min-w-0 rounded border border-white/10 bg-black/30 px-3 py-2 text-base text-zinc-100" />
      </label>
      <datalist id={listId}>{categories.map((category) => <option key={category} value={category} />)}</datalist>
    </>
  );
}
function LedgerField({ label, inputMode, type = 'text', value, placeholder, onChange }) {
  return <label className="grid min-w-0 gap-1 text-xs text-zinc-400">{label}<input type={type} inputMode={inputMode} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-11 min-w-0 max-w-full rounded border border-white/10 bg-black/30 px-3 text-base text-zinc-100" /></label>;
}
function IconButton({ icon: Icon, label, disabled, onClick }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="grid h-11 w-11 place-items-center rounded border border-white/10 text-zinc-400 hover:text-zinc-100 disabled:opacity-40"><Icon size={16} /></button>;
}
function LoadingRow() { return <p role="status" className="flex items-center gap-2 py-6 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" />Loading expenses</p>; }
function formFromExpense(row) { return { vendor: row.vendor ?? '', category: row.category ?? 'Other', amount: String(row.amount ?? ''), spent_on: row.spent_on ?? localDate(), notes: row.notes ?? '' }; }
function toPayload(form) { return { vendor: form.vendor.trim(), category: form.category.trim(), amount: parseDecimal(form.amount), spent_on: form.spent_on, notes: form.notes.trim() || null }; }
function validateExpenseForm(form) {
  if (!form.vendor.trim()) return 'Vendor is required.';
  if (!form.category.trim()) return 'Category is required.';
  const date = new Date(form.spent_on + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.spent_on) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== form.spent_on) return 'Expense date is invalid.';
  if (!Number.isFinite(parseDecimal(form.amount)) || parseDecimal(form.amount) <= 0) return 'Amount must be greater than zero.';
  return '';
}
function parseDecimal(value) { return Number(String(value ?? '').replace(',', '.')); }
function formatMoney(value) { return Math.abs(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function sortExpenses(rows) { return rows.slice().sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on)) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))); }
function buildCategorySpend(rows) {
  const totals = new Map();
  rows.forEach((row) => totals.set(row.category || 'Other', (totals.get(row.category || 'Other') || 0) + Math.abs(Number(row.amount) || 0)));
  return [...totals].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}
function getMonthRange(value) {
  const [year, month] = value.split('-').map(Number);
  return { start: value + '-01', end: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10) };
}
function formatMonthLabel(value) { return new Date(value + '-01T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }
