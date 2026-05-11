import { Bot, Check, Cpu, Sparkles, X } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';

export function AIAssistantTab() {
  const { acceptWidget, chatMessages, finance, health, rejectWidget, selectedDayAgenda, workoutStatus } = useLifeOS();

  return (
    <div className="grid grid-cols-12 gap-3">
      <Panel className="col-span-12 xl:col-span-8">
        <PanelHeader eyebrow="LifeOS Brain" title="Command Chat" right={<Cpu size={16} className="text-cyan-300" />} />
        <div className="thin-scrollbar max-h-[640px] space-y-3 overflow-y-auto p-3">
          {chatMessages.map((message) => (
            <div
              key={message.id}
              className={`rounded-md border p-3 ${
                message.role === 'assistant'
                  ? 'border-cyan-400/10 bg-cyan-400/[0.04]'
                  : 'ml-auto max-w-[70%] border-white/5 bg-black/40'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                {message.role === 'assistant' ? <Bot size={16} className="text-cyan-300" /> : <Sparkles size={16} className="text-amber-300" />}
                <span className="data-text text-[10px] uppercase tracking-wider text-zinc-500">
                  {message.role === 'assistant' ? 'LifeOS Brain' : 'Operator'}
                </span>
                {message.title ? <Tag tone="cyan">{message.title}</Tag> : null}
              </div>
              <p className="text-sm leading-6 text-zinc-200">{message.body}</p>
              {message.widgets ? (
                <div className="mt-3 grid gap-2">
                  {message.widgets.map((widget) => (
                    <div key={widget.id} className="grid gap-2 rounded-md border border-white/5 bg-black/30 p-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{widget.label}</p>
                        <p className="data-text text-[11px] text-emerald-300">{widget.impact}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => acceptWidget(widget.id)}
                          disabled={widget.accepted || widget.rejected}
                          className={`grid h-9 w-9 place-items-center rounded-md border ${
                            widget.accepted
                              ? 'border-emerald-400/30 bg-emerald-400/20 text-emerald-300'
                              : 'border-white/10 bg-white/[0.03] text-zinc-300'
                          }`}
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectWidget(widget.id)}
                          disabled={widget.accepted || widget.rejected}
                          className={`grid h-9 w-9 place-items-center rounded-md border ${
                            widget.rejected
                              ? 'border-red-400/30 bg-red-400/20 text-red-300'
                              : 'border-white/10 bg-white/[0.03] text-zinc-300'
                          }`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 p-3">
          <div className="grid grid-cols-[1fr_44px] gap-2">
            <input
              placeholder="Ask LifeOS to reschedule, reconcile, summarize, or coach..."
              className="rounded-md border border-white/10 bg-black px-3 py-3 text-sm text-zinc-100 outline-none focus:border-cyan-400/40"
            />
            <button type="button" className="grid place-items-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
              <Sparkles size={18} />
            </button>
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-4">
        <PanelHeader eyebrow="Synthesis" title="Live Context Feed" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <MiniMetric label="Hydration" value={`${health.water}/8`} tone="text-cyan-300" sub="below pace" />
          <MiniMetric label="Sleep" value={`${health.sleepQuality}%`} tone="text-emerald-300" sub={`${health.sleepHours}h`} />
          <MiniMetric label="Training" value={workoutStatus.mode} tone={workoutStatus.accent} sub="push day" />
          <MiniMetric label="Balance" value={`EUR ${Math.round(finance.balance)}`} tone="text-emerald-300" sub="cash" />
        </div>
        <div className="border-t border-white/5 p-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Schedule Extraction</p>
          <div className="space-y-2">
            {selectedDayAgenda.slice(0, 5).map((event) => (
              <div key={`${event.time}-${event.title}`} className="rounded border border-white/5 bg-black/25 px-2 py-2">
                <p className="data-text text-[10px] text-zinc-500">{event.time} / {event.duration}</p>
                <p className="truncate text-xs text-zinc-200">{event.title}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
