'use client';
import { Button } from '@/components/ui/button';

export function PrintButton() {
  return <Button variant="outline" className="min-h-11" onClick={() => window.print()}>Export PDF</Button>;
}
