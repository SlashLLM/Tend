'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Shown once after an invite or reset. The password is not stored anywhere the admin can see it again. */
export function TempPassword({ who, password, onDone }: { who: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="grid gap-2 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
      <p>Temporary password for <span className="font-medium">{who}</span>. Give it to them in person or by phone. They choose their own when they first sign in.</p>
      <div className="flex items-center gap-2">
        <code aria-label="Temporary password" className="rounded bg-card px-2 py-1 font-mono text-base tracking-wide">{password}</code>
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={async () => {
          try {
            await navigator.clipboard.writeText(password);
            setCopied(true);
          } catch { /* clipboard blocked: the password is still on screen */ }
        }}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-muted-foreground">It won’t be shown again. If it’s lost, reset the password.</p>
      <Button type="button" variant="ghost" size="sm" className="min-h-11 justify-self-start" onClick={onDone}>Done</Button>
    </div>
  );
}
