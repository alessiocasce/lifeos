import { Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from 'recharts';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';

const today = new Date().toISOString().slice(0, 10);
const defaultCategories = ['Food', 'Training', 'Transport', 'Rent', 'Software', 'Books', 'Health', 'Other'];
const categoryColors = ['#22d3ee', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#a3e635', '#06b6d4', '#71717a'];

const emptyForm = {
  vendor: '',
  category: 'Food',
  amount: '',
  spent_on: today,
  notes: '',
};

export function FinancesTab() {
  const {
    createExpense,
    deleteExpense,
    expenses,
    expensesError,
    expensesStatus,
    loadExpenseMonth,
    monthlyExpenses,
    monthlyExpensesError,
    monthlyExpensesStatus,
    reloadExpenses,
    updateExpense,
  } = useLifeOS();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const selectedMonthRange = useMemo(() => getMonthRange(selectedMonth), [selectedMonth]);
  const sortedExpenses = useMemo(() => sortExpenses(expenses), [expenses]);
  const sortedMonthlyExpenses = useMemo(
    () => sortExpenses(monthlyExpenses.filter((expense) => expense.spent_on >= selectedMonthRange.start && expense.spent_on < selectedMonthRange.end)),
    [monthlyExpenses, selectedMonthRange.end, selectedMonthRange.start],
  );
  const monthlySpend = useMemo(() => sumExpenses(sortedMonthlyExpenses), [sortedMonthlyExpenses]);
  const categorySpend = useMemo(() => buildCategorySpend(sortedMonthlyExpenses), [sortedMonthlyExpenses]);
  const categories = useMemo(() => mergeCategories([...sortedExpenses, ...sortedMonthlyExpenses]), [sortedExpenses, sortedMonthlyExpenses]);
  const recentInitialLoading = expensesStatus === 'loading' && sortedExpenses.length === 0;
  const recentResolved = ['ready', 'error', 'not-configured', 'no-session'].includes(expensesStatus);
  const monthlyInitialLoading = monthlyExpensesStatus === 'loading' && sortedMonthlyExpenses.length === 0;

  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEditId, setSavingEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadExpenseMonth(selectedMonthRange.start, selectedMonthRange.end);
  }, [loadExpenseMonth, selectedMonthRange.end, selectedMonthRange.start]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');

    const validationError = validateExpenseForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    try {
      await createExpense(toPayload(form));
      await Promise.all([
        reloadExpenses(),
        loadExpenseMonth(selectedMonthRange.start, selectedMonthRange.end),
      ]);
      setForm((prev) => ({ ...emptyForm, category: prev.category, spent_on: today }));
    } catch (error) {
      setFormError(error.message || 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (expense) => {
    setEditingId(expense.id);
    setEditForm(formFromExpense(expense));
    setFormError('');
  };

  const saveEdit = async (id) => {
    setFormError('');
    const validationError = validateExpenseForm(editForm);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSavingEditId(id);
    try {
      await updateExpense(id, toPayload(editForm));
      await Promise.all([
        reloadExpenses(),
        loadExpenseMonth(selectedMonthRange.start, selectedMonthRange.end),
      ]);
      setEditingId(null);
      setEditForm(null);
    } catch (error) {
      setFormError(error.message || 'Failed to update expense.');
    } finally {
      setSavingEditId(null);
    }
  };

  const removeExpense = async (id) => {
    setDeletingId(id);
    setFormError('');
    try {
      await deleteExpense(id);
      await Promise.all([
        reloadExpenses(),
        loadExpenseMonth(selectedMonthRange.start, selectedMonthRange.end),
      ]);
    } catch (error) {
      setFormError(error.message || 'Failed to delete expense.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <Panel className="col-span-12">
        <div className="grid gap-3 p-3 xl:grid-cols-[1fr_520px]">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">Selected Month Spend</p>
            <p className="data-text text-4xl font-black leading-none text-emerald-300 sm:text-6xl">
              EUR {formatMoney(monthlySpend)}
            </p>
            <p className="data-text mt-2 text-[11px] text-zinc-500">
              {monthlyInitialLoading
                ? `Syncing ${formatMonthLabel(selectedMonth)} expenses`
                : `${sortedMonthlyExpenses.length} persisted expenses / ${formatMonthLabel(selectedMonth)}`}
            </p>
          </div>

          <form onSubmit={submit} className="grid gap-2 self-end">
            <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
              <LedgerField label="Vendor" value={form.vendor} placeholder="Vendor" onChange={(value) => updateForm('vendor', value)} />
              <LedgerField label="Amount" inputMode="decimal" value={form.amount} placeholder="0.00" onChange={(value) => updateForm('amount', value)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_150px_48px]">
              <LedgerField label="Category" value={form.category} list="expense-categories" onChange={(value) => updateForm('category', value)} />
              <LedgerField label="Date" type="date" value={form.spent_on} onChange={(value) => updateForm('spent_on', value)} />
              <button
                type="submit"
                disabled={saving}
                className="flex h-12 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                title="Save expense"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={17} />}
                <span className="sm:hidden">Save</span>
              </button>
            </div>
            <LedgerField label="Notes" value={form.notes} placeholder="Optional notes" onChange={(value) => updateForm('notes', value)} />
            <datalist id="expense-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            {formError || expensesError ? <p className="data-text text-[11px] text-red-300">{formError || expensesError}</p> : null}
          </form>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-7">
        <PanelHeader
          eyebrow="Month Analysis"
          title="Spend By Category"
          right={<SourceStatus status={monthlyExpensesStatus} />}
        />
        <div className="grid gap-3 p-3">
          <label className="rounded-md border border-white/5 bg-[#121212] px-2 py-1.5 sm:max-w-56">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Selected Month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value || currentMonthValue())}
              className="data-text mt-1 w-full bg-transparent text-base font-semibold text-zinc-100 outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniMetric label="Total Spend" value={`EUR ${formatMoney(monthlySpend)}`} tone="text-emerald-300" sub="month" />
            <MiniMetric label="Entries" value={sortedMonthlyExpenses.length} tone="text-cyan-300" sub="persisted" />
            <MiniMetric label="Avg Ticket" value={`EUR ${formatMoney(sortedMonthlyExpenses.length ? monthlySpend / sortedMonthlyExpenses.length : 0)}`} tone="text-amber-300" sub="expense" />
            <MiniMetric label="Top Category" value={categorySpend[0]?.category ?? '--'} tone="text-zinc-100" sub={categorySpend[0] ? `EUR ${formatMoney(categorySpend[0].total)}` : 'none'} />
          </div>

          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categorySpend}>
                <XAxis dataKey="category" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {categorySpend.map((entry, index) => (
                    <Cell key={entry.category} fill={entry.color ?? categoryColors[index % categoryColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {monthlyInitialLoading ? (
              <LoadingRow label="Loading selected month" />
            ) : categorySpend.length ? (
              categorySpend.map((item) => (
                <div key={item.category} className="rounded border border-white/5 bg-black/25 p-2">
                  <div className="mb-1 h-1.5 rounded" style={{ backgroundColor: item.color }} />
                  <p className="truncate text-xs text-zinc-300">{item.category}</p>
                  <p className="data-text text-[11px] text-zinc-500">EUR {formatMoney(item.total)}</p>
                </div>
              ))
            ) : (
              <p className="col-span-full rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
                No expenses logged for the selected month.
              </p>
            )}
          </div>
          {monthlyExpensesError ? <p className="data-text text-[11px] text-red-300">{monthlyExpensesError}</p> : null}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-5">
        <PanelHeader eyebrow="Ledger" title="Recent Expenses" right={<SourceStatus status={expensesStatus} />} />
        <div className="grid gap-2 p-3">
          {recentInitialLoading ? (
            <LoadingRow label="Loading expenses" />
          ) : sortedExpenses.length ? (
            sortedExpenses.slice(0, 15).map((expense) =>
              editingId === expense.id ? (
                <EditExpenseRow
                  key={expense.id}
                  categories={categories}
                  editForm={editForm}
                  loading={savingEditId === expense.id}
                  onCancel={() => {
                    setEditingId(null);
                    setEditForm(null);
                  }}
                  onSave={() => saveEdit(expense.id)}
                  setEditForm={setEditForm}
                />
              ) : (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  loadingDelete={deletingId === expense.id}
                  onDelete={() => removeExpense(expense.id)}
                  onEdit={() => beginEdit(expense)}
                />
              ),
            )
          ) : recentResolved ? (
            <p className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
              No persisted expenses yet. Add one above to start the ledger.
            </p>
          ) : (
            <LoadingRow label="Expense history pending" />
          )}
        </div>
      </Panel>
    </div>
  );
}

function LedgerField({ inputMode, label, list, onChange, placeholder = '', type = 'text', value }) {
  return (
    <label className="rounded-md border border-white/5 bg-[#121212] px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        list={list}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="data-text mt-1 w-full min-w-0 bg-transparent text-base font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
      />
    </label>
  );
}

function ExpenseRow({ expense, loadingDelete, onDelete, onEdit }) {
  return (
    <div className="grid gap-2 rounded-md border border-white/5 bg-black/25 p-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-100">{expense.vendor}</p>
          <Tag tone="cyan">{expense.category}</Tag>
        </div>
        <p className="data-text mt-1 text-[10px] text-zinc-500">
          {expense.spent_on} / {expense.notes || 'no notes'}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="data-text text-sm font-bold text-zinc-100">EUR {formatMoney(expense.amount)}</span>
        <IconButton icon={Pencil} onClick={onEdit} title="Edit expense" />
        <IconButton icon={Trash2} loading={loadingDelete} onClick={onDelete} title="Delete expense" tone="red" />
      </div>
    </div>
  );
}

function EditExpenseRow({ categories, editForm, loading, onCancel, onSave, setEditForm }) {
  const update = (field, value) => setEditForm((prev) => ({ ...prev, [field]: value }));
  return (
    <div className="grid gap-2 rounded-md border border-cyan-400/20 bg-cyan-400/[0.04] p-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <LedgerField label="Vendor" value={editForm.vendor} onChange={(value) => update('vendor', value)} />
        <LedgerField label="Amount" inputMode="decimal" value={editForm.amount} onChange={(value) => update('amount', value)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <LedgerField label="Category" list="expense-categories-edit" value={editForm.category} onChange={(value) => update('category', value)} />
        <LedgerField label="Date" type="date" value={editForm.spent_on} onChange={(value) => update('spent_on', value)} />
      </div>
      <LedgerField label="Notes" value={editForm.notes} onChange={(value) => update('notes', value)} />
      <datalist id="expense-categories-edit">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={loading}
          className="flex h-10 items-center justify-center gap-2 rounded border border-emerald-400/30 bg-emerald-400/10 text-sm text-emerald-300 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-10 items-center justify-center gap-2 rounded border border-white/10 bg-white/[0.03] text-sm text-zinc-300"
        >
          <X size={15} />
          Cancel
        </button>
      </div>
    </div>
  );
}

function IconButton({ icon: Icon, loading = false, onClick, title, tone = 'zinc' }) {
  const DisplayIcon = loading ? Loader2 : Icon;
  const toneClass = tone === 'red'
    ? 'border-red-400/20 bg-red-400/10 text-red-300'
    : 'border-white/10 bg-white/[0.03] text-zinc-300';
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={loading}
      className={`grid h-10 w-10 place-items-center rounded border sm:h-8 sm:w-8 ${toneClass} disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600`}
    >
      <DisplayIcon size={14} className={loading ? 'animate-spin' : ''} />
    </button>
  );
}

function LoadingRow({ label }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/5 bg-black/25 p-3 data-text text-[11px] text-zinc-500">
      <Loader2 size={15} className="animate-spin text-cyan-300" />
      {label}
    </div>
  );
}

function SourceStatus({ status }) {
  const label = status === 'loading' ? 'SYNCING' : status === 'error' ? 'ERROR' : 'LIVE';
  const tone = status === 'error'
    ? 'border-red-400/20 bg-red-400/10 text-red-300'
    : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  return <span className={`data-text rounded border px-2 py-1 text-[10px] ${tone}`}>{label}</span>;
}

function formFromExpense(expense) {
  return {
    vendor: expense.vendor ?? '',
    category: expense.category ?? 'Other',
    amount: stringValue(expense.amount),
    spent_on: expense.spent_on ?? today,
    notes: expense.notes ?? '',
  };
}

function toPayload(form) {
  return {
    vendor: form.vendor.trim(),
    category: form.category.trim(),
    amount: parseDecimal(form.amount),
    spent_on: form.spent_on,
    notes: form.notes.trim() || null,
  };
}

function validateExpenseForm(form) {
  if (!form.vendor.trim()) return 'Vendor is required.';
  if (!form.category.trim()) return 'Category is required.';
  if (!isValidDate(form.spent_on)) return 'Expense date is invalid.';
  const amount = parseDecimal(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Amount must be greater than zero.';
  return '';
}

function buildCategorySpend(expenses) {
  const map = new Map();
  expenses.forEach((expense) => {
    const category = expense.category || 'Other';
    map.set(category, (map.get(category) ?? 0) + Math.abs(Number(expense.amount) || 0));
  });
  return Array.from(map.entries())
    .map(([category, total], index) => ({ category, total, color: categoryColors[index % categoryColors.length] }))
    .sort((a, b) => b.total - a.total);
}

function mergeCategories(expenses) {
  return Array.from(new Set([...defaultCategories, ...expenses.map((expense) => expense.category).filter(Boolean)])).sort();
}

function sumExpenses(expenses) {
  return expenses.reduce((total, expense) => total + Math.abs(Number(expense.amount) || 0), 0);
}

function sortExpenses(expenses) {
  return expenses.slice().sort((a, b) => {
    if (a.spent_on !== b.spent_on) return new Date(b.spent_on) - new Date(a.spent_on);
    return new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0);
  });
}

function parseDecimal(value) {
  return Number(String(value ?? '').replace(',', '.'));
}

function isValidDate(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime());
}

function stringValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0.00';
  return Math.abs(numeric).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function getMonthRange(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  if (!year || !month) return getMonthRange(currentMonthValue());
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function formatMonthLabel(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  if (!year || !month) return 'Selected month';
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
