'use client';
import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { scheduleObservation } from '@/app/actions/observation';

/** Local datetime-input value → ISO with the Singapore offset. */
export function sgtToIso(local: string) {
  return new Date(`${local}:00+08:00`).toISOString();
}

export function ScheduleForm({ educators, classes }: { educators: { id: string; name: string }[]; classes: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [educatorId, setEducatorId] = useState('');
  const [classId, setClassId] = useState('');
  const [when, setWhen] = useState('');
  const [title, setTitle] = useState('Story time');
  const [duration, setDuration] = useState(20);

  return (
    <form
      className="tend-card grid gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await scheduleObservation({ educatorId, when: sgtToIso(when), durationMin: duration, title, classId: classId || null });
            toast.success('Scheduled — the educator will choose a focus');
            setEducatorId('');
            setWhen('');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not schedule');
          }
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="educator">Educator</Label>
        <select id="educator" required value={educatorId} onChange={(e) => setEducatorId(e.target.value)} className="min-h-11 rounded-md border bg-card px-3">
          <option value="">Choose…</option>
          {educators.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="class">Class</Label>
        <select id="class" value={classId} onChange={(e) => setClassId(e.target.value)} className="min-h-11 rounded-md border bg-card px-3">
          <option value="">—</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="title">Activity</Label>
        <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} className="min-h-11" />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="when">When (Singapore time)</Label>
          <Input id="when" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className="min-h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="duration">Minutes</Label>
          <Input id="duration" type="number" min={5} max={90} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="min-h-11 w-24" />
        </div>
      </div>
      <Button type="submit" className="min-h-11" disabled={pending || !educatorId || !when}>
        {pending && <Loader2 className="animate-spin" aria-hidden />} Schedule
      </Button>
    </form>
  );
}
