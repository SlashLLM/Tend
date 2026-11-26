'use client';
import { Button } from '@/components/ui/button';

export function PrintButton({ label }: { label: string }) {
  return <Button variant="outline" className="min-h-11" onClick={() => window.print()}>{label}</Button>;
}
