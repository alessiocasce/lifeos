import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X } from 'lucide-react';

const calloutStyles = {
  good: {
    label: 'Signal',
    shell: 'border-emerald-400/25 bg-emerald-400/[0.08]',
    labelClass: 'text-emerald-300',
  },
  warn: {
    label: 'Caution',
    shell: 'border-amber-400/25 bg-amber-400/[0.08]',
    labelClass: 'text-amber-300',
  },
  bad: {
    label: 'Risk',
    shell: 'border-red-400/25 bg-red-400/[0.08]',
    labelClass: 'text-red-300',
  },
  info: {
    label: 'Info',
    shell: 'border-cyan-400/20 bg-cyan-400/[0.07]',
    labelClass: 'text-cyan-300',
  },
  action: {
    label: 'Action',
    shell: 'border-violet-400/25 bg-violet-400/[0.08]',
    labelClass: 'text-violet-300',
  },
};

const markdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-50">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
  ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-x-auto rounded-md border border-white/10 bg-black/50 p-3 text-xs leading-5 text-zinc-200">
      {children}
    </pre>
  ),
  code: ({ inline, children, node, ...props }) => {
    if (inline) {
      return (
        <code className="rounded border border-white/10 bg-white/[0.06] px-1 py-0.5 text-[0.9em] text-cyan-100" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="block min-w-0 whitespace-pre text-xs text-zinc-200" {...props}>
        {children}
      </code>
    );
  },
  a: ({ href, children }) => {
    const safeHref = getSafeHref(href);
    if (!safeHref) return <span>{children}</span>;
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-300 underline decoration-cyan-400/30 underline-offset-2 hover:text-cyan-200"
      >
        {children}
      </a>
    );
  },
};

const markdownElements = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'a', 'br'];

export function AssistantMarkdown({ content }) {
  const parts = parseAssistantContent(content);
  return (
    <div className="grid min-w-0 gap-2 text-sm leading-6 text-zinc-100">
      {parts.map((part, index) => (
        part.type === 'callout' ? (
          <LifeOSCallout key={`${part.type}-${part.tone}-${index}`} tone={part.tone}>
            <MarkdownBlock content={part.content} />
          </LifeOSCallout>
        ) : (
          <MarkdownBlock key={`${part.type}-${index}`} content={part.content} />
        )
      ))}
    </div>
  );
}

export function AiActionHistoryList({ logs = [], status, limit = 10 }) {
  const [selectedLog, setSelectedLog] = useState(null);
  const shownLogs = logs.slice(0, limit);

  if (status === 'loading' && !logs.length) {
    return <LoadingActionHistory label="Loading recent AI actions" />;
  }

  if (!shownLogs.length) {
    return (
      <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
        <p className="text-sm font-medium text-zinc-100">No AI actions yet.</p>
      </div>
    );
  }

  return (
    <>
      {shownLogs.map((log) => (
        <ActionLogCard key={log.id} log={log} onClick={() => setSelectedLog(log)} />
      ))}
      {selectedLog ? (
        <ActionLogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      ) : null}
    </>
  );
}

function ActionLogCard({ log, onClick }) {
  const title = getActionLogTitle(log);
  const count = Number(log.action_count ?? 0);
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3 text-left transition hover:border-cyan-400/25 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Chip tone="cyan">{log.source || 'app'}</Chip>
        <Chip tone={log.status === 'error' ? 'red' : 'emerald'}>{log.status || 'success'}</Chip>
        <span className="data-text text-[10px] text-zinc-500">{formatLogTime(log.created_at)}</span>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        <p className="data-text truncate text-sm font-semibold text-zinc-100" title={title}>{title}</p>
        {count ? <span className="data-text rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-300">/ {count}</span> : null}
      </div>
      {log.status === 'error' ? <p className="mt-1 text-xs text-red-300">Error recorded</p> : null}
    </button>
  );
}

function ActionLogDetailModal({ log, onClose }) {
  const title = getActionLogTitle(log);
  const refs = Array.isArray(log.record_refs) ? log.record_refs : [];
  const shownRefs = refs.slice(0, 10);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid bg-black/75 p-0 sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI action detail"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col overflow-hidden border-white/10 bg-[#0f0f0f] shadow-2xl sm:h-auto sm:max-h-[86dvh] sm:max-w-3xl sm:rounded-xl sm:border">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3 pt-[calc(env(safe-area-inset-top)+12px)] sm:pt-3">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-violet-300">AI Action Detail</p>
            <h3 className="mt-1 truncate text-base font-semibold text-zinc-100" title={title}>{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-red-400/30 hover:text-red-200"
            aria-label="Close action detail"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="cyan">{log.source || 'app'}</Chip>
            <Chip tone={log.status === 'error' ? 'red' : 'emerald'}>{log.status || 'success'}</Chip>
            <Chip tone="zinc">{formatLogTime(log.created_at)}</Chip>
            {log.request_id ? <Chip tone="zinc">req {log.request_id}</Chip> : null}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <DetailMetric label="Action Type" value={formatActionType(log.action_type)} />
            <DetailMetric label="Action Count" value={String(Number(log.action_count ?? 0))} />
            {log.request_id ? <DetailMetric label="Request ID" value={log.request_id} /> : null}
          </div>

          <DetailSection title="Request">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{log.user_message || 'No request stored.'}</p>
          </DetailSection>

          {log.error_message ? (
            <DetailSection title="Error">
              <p className="break-words text-sm leading-6 text-red-200">{log.error_message}</p>
            </DetailSection>
          ) : null}

          <DetailSection title="Response">
            {log.answer ? <AssistantMarkdown content={log.answer} /> : <p className="text-sm text-zinc-500">No response stored.</p>}
          </DetailSection>

          <DetailSection title="Record References">
            {shownRefs.length ? (
              <div className="grid gap-1.5">
                {shownRefs.map((ref, index) => (
                  <div key={`${ref.table}-${ref.id}-${index}`} className="min-w-0 rounded border border-white/5 bg-black/25 px-2 py-1.5">
                    <p className="truncate text-xs font-medium text-zinc-100" title={ref.label || ref.id}>
                      {ref.table}: {ref.label || ref.id}
                    </p>
                    {ref.date ? <p className="data-text text-[10px] text-zinc-500">{ref.date}</p> : null}
                  </div>
                ))}
                {refs.length > shownRefs.length ? <p className="data-text text-[11px] text-zinc-500">+{refs.length - shownRefs.length} more</p> : null}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No record references stored.</p>
            )}
          </DetailSection>

          {Array.isArray(log.actions) && log.actions.length ? (
            <details className="mt-3 rounded-md border border-white/5 bg-black/25 p-3">
              <summary className="cursor-pointer data-text text-[10px] uppercase text-zinc-500">Sanitized Actions</summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-zinc-400">
                {JSON.stringify(log.actions, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailSection({ children, title }) {
  return (
    <section className="mt-3 min-w-0 rounded-md border border-white/5 bg-black/20 p-3">
      <p className="data-text mb-2 text-[10px] uppercase tracking-wider text-zinc-500">{title}</p>
      {children}
    </section>
  );
}

function DetailMetric({ label, value }) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-black/25 p-2">
      <p className="data-text text-[10px] uppercase text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-100" title={value}>{value || '--'}</p>
    </div>
  );
}

function Chip({ children, tone }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
    : tone === 'red'
      ? 'border-red-400/20 bg-red-400/10 text-red-300'
      : tone === 'cyan'
        ? 'border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-300'
        : 'border-white/10 bg-white/[0.03] text-zinc-400';
  return <span className={`data-text rounded border px-2 py-1 text-[10px] uppercase ${toneClass}`}>{children}</span>;
}

function LifeOSCallout({ tone, children }) {
  const style = calloutStyles[tone] ?? calloutStyles.info;
  return (
    <div className={`min-w-0 rounded-md border px-3 py-2 ${style.shell}`}>
      <p className={`data-text mb-1 text-[10px] uppercase tracking-wider ${style.labelClass}`}>{style.label}</p>
      <div className="min-w-0 text-zinc-100">{children}</div>
    </div>
  );
}

function MarkdownBlock({ content }) {
  const markdown = String(content ?? '').trim();
  if (!markdown) return null;
  return (
    <div className="min-w-0">
      <ReactMarkdown allowedElements={markdownElements} components={markdownComponents} unwrapDisallowed>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function parseAssistantContent(content) {
  const value = String(content ?? '');
  const parts = [];
  const calloutPattern = /\[(good|warn|bad|info|action)\]([\s\S]*?)\[\/\1\]/gi;
  let cursor = 0;
  let match = calloutPattern.exec(value);

  while (match) {
    if (match.index > cursor) {
      parts.push({ type: 'markdown', content: value.slice(cursor, match.index) });
    }
    parts.push({ type: 'callout', tone: match[1].toLowerCase(), content: match[2] });
    cursor = match.index + match[0].length;
    match = calloutPattern.exec(value);
  }

  if (cursor < value.length) {
    parts.push({ type: 'markdown', content: value.slice(cursor) });
  }

  return parts.length ? parts : [{ type: 'markdown', content: value }];
}

function getActionLogTitle(log) {
  const type = String(log?.action_type ?? '').trim();
  const refs = Array.isArray(log?.record_refs) ? log.record_refs : [];
  if (type === 'update_health_log' && refs.some((ref) => ref.table === 'health_logs')) return 'HEALTH LOG UPDATE';
  if (type === 'create_expense' && refs[0]?.label) return `EXPENSE: ${truncate(refs[0].label, 28).toUpperCase()}`;
  if ((type === 'create_calendar_events' || type === 'finite_recurring_calendar_events') && Number(log?.action_count ?? 0) > 1) {
    return type === 'finite_recurring_calendar_events' ? 'RECURRING CALENDAR PLAN' : 'CREATE CALENDAR EVENTS';
  }

  return {
    analyze_and_plan: 'ANALYZE AND PLAN',
    finite_recurring_calendar_events: 'RECURRING CALENDAR PLAN',
    create_calendar_events: 'CREATE CALENDAR EVENTS',
    create_calendar_event: 'CREATE CALENDAR EVENT',
    update_health_log: 'UPDATE HEALTH LOG',
    create_expense: 'CREATE EXPENSE',
    blocked_destructive: 'BLOCKED REQUEST',
  }[type] ?? 'AI ACTION';
}

function formatActionType(type) {
  return String(type || 'AI action').replaceAll('_', ' ');
}

function formatLogTime(value) {
  if (!value) return '--';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSafeHref(href) {
  const value = String(href ?? '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : '';
  } catch {
    return '';
  }
}

function LoadingActionHistory({ label }) {
  return (
    <div className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
      <p className="data-text text-sm text-cyan-300">{label}</p>
    </div>
  );
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}
