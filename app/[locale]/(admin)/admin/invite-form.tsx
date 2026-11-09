'use client';
import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteUser } from '@/app/actions/admin';

export function InviteForm({ centres }: { centres: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: '', email: '', role: 'educator', centreId: centres[0]?.id ?? '' });
  const orgWide = f.role === 'hq' || f.role === 'admin';
  return (
    <form className="tend-card grid gap-3 p-5" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        try {
          await inviteUser({ ...f, centreId: orgWide ? null : f.centreId });
          toast.success(`Invited ${f.email}`);
          setF({ ...f, name: '', email: '' });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not invite');
        }
      });
    }}>
      <div className="grid gap-1.5"><Label htmlFor="iname">Full name</Label><Input id="iname" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="min-h-11" /></div>
      <div className="grid gap-1.5"><Label htmlFor="iemail">Work email</Label><Input id="iemail" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="min-h-11" /></div>
      <div className="grid gap-1.5"><Label htmlFor="irole">Role</Label>
        <select id="irole" className="min-h-11 rounded-md border bg-card px-2" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {['educator', 'leader', 'mentor', 'hq', 'admin'].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {!orgWide && (
        <div className="grid gap-1.5"><Label htmlFor="icentre">Centre</Label>
          <select id="icentre" className="min-h-11 rounded-md border bg-card px-2" value={f.centreId} onChange={(e) => setF({ ...f, centreId: e.target.value })}>
            {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <Button type="submit" className="min-h-11" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden />} Send invite</Button>
    </form>
  );
}
