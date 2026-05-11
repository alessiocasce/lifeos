import { Bot, CalendarRange, CheckCircle2 } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { Panel, PanelHeader, PriorityDot, Tag } from '../components/ui';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarTab() {
  const { aiTriage, calendarWeeks, selectedDay, selectedDayAgenda, setAiTriage, setSelectedDay } = useLifeOS();

  return (
    <div className="grid grid-cols-12 gap-3">
      <Panel className="col-span-12 xl:col-span-8">
        <PanelHeader
          eyebrow="Future Planning"
          title="May 2026 Command Grid"
          right={
            <button
              type="button"
              onClick={() => setAiTriage(!aiTriage)}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                aiTriage
                  ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
                  : 'border-white/10 bg-white/[0.03] text-zinc-400'
              }`}
            >
              <Bot size={14} />
              AI Triage
            </button>
          }
        />
        <div className="p-3">
          <div className="grid grid-cols-7 border-b border-white/5 pb-2">
            {weekdays.map((day) => (
              <div key={day} className="data-text px-2 text-[10px] uppercase text-zinc-500">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 pt-2">
            {calendarWeeks.flat().map((day, index) => {
              const isSelected = day.day === selectedDay && !day.muted;
              return (
                <button
                  key={`${day.day}-${index}`}
                  type="button"
                  onClick={() => !day.muted && setSelectedDay(day.day)}
                  className={`min-h-28 rounded-md border p-2 text-left transition ${
                    isSelected ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-white/5 bg-black/20 hover:bg-white/[0.03]'
                  } ${day.muted ? 'opacity-35' : ''}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`data-text text-sm ${isSelected ? 'text-cyan-300' : 'text-zinc-300'}`}>{day.day}</span>
                    {day.events.length ? <span className="data-text text-[10px] text-zinc-600">{day.events.length}</span> : null}
                  </div>
                  <div className="space-y-1">
                    {day.events.slice(0, 3).map((event) => {
                      const dim = aiTriage && event.priority === 'low';
                      return (
                        <div
                          key={event.title}
                          className={`rounded border border-white/5 bg-[#121212] px-1.5 py-1 ${dim ? 'opacity-30' : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            <PriorityDot priority={event.priority} />
                            <span className="truncate text-[11px] text-zinc-200">{event.title}</span>
                          </div>
                          <div className="mt-1 flex gap-1">
                            {event.tags.map((tag) => (
                              <Tag key={tag} tone={event.priority === 'high' ? 'red' : event.priority === 'medium' ? 'cyan' : 'zinc'}>
                                {tag}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-4">
        <PanelHeader
          eyebrow="Selected Day"
          title={`May ${selectedDay}, 2026`}
          right={<CalendarRange size={16} className="text-cyan-300" />}
        />
        <div className="space-y-2 p-3">
          {selectedDayAgenda.map((event) => {
            const dim = aiTriage && event.priority === 'low';
            return (
              <div key={`${event.time}-${event.title}`} className={`rounded-md border border-white/5 bg-black/25 p-3 ${dim ? 'opacity-30' : ''}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <PriorityDot priority={event.priority} />
                      <p className="text-sm font-medium text-zinc-100">{event.title}</p>
                    </div>
                    <p className="data-text mt-1 text-[11px] text-zinc-500">
                      {event.time} / {event.duration} / {event.priority.toUpperCase()}
                    </p>
                  </div>
                  {event.priority === 'high' ? <CheckCircle2 size={16} className="text-emerald-300" /> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {event.tags.map((tag) => (
                    <Tag key={tag} tone={event.priority === 'high' ? 'red' : event.priority === 'medium' ? 'cyan' : 'zinc'}>
                      {tag}
                    </Tag>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
