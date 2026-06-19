'use client';

import {
  Loader2,
  PauseCircle,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Rocket,
  XCircle,
} from 'lucide-react';
import { cn } from '../_lib/cn';
import type { CardState } from '../_lib/types';

/**
 * StatusChip — the honest RunStatus → chip map (brief §"Status chip map").
 * Color is NEVER the only signal: every chip carries a text label + an icon.
 * `running` shows a live pulse; `draft_stalled` shows "stopped on stage N".
 */
interface StatusMeta {
  label: (stage: number, gate?: string | null) => string;
  classes: string;
  icon: React.ComponentType<{ className?: string }>;
  pulse?: boolean;
}

const META: Record<CardState, StatusMeta> = {
  running: {
    label: () => 'Running',
    classes: 'bg-brand-primary/10 text-brand-primary border-brand-primary/20',
    icon: Loader2,
    pulse: true,
  },
  draft_stalled: {
    label: (stage) => `Draft · stopped on stage ${stage}`,
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: PauseCircle,
  },
  awaiting_gate: {
    label: (_stage, gate) => (gate ? `Needs you · ${gate}` : 'Needs you'),
    classes: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: UserCheck,
  },
  escalated: {
    label: () => 'Stuck · needs Dennis',
    classes: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: AlertTriangle,
  },
  draft_ready: {
    label: () => 'Draft ready',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  published: {
    label: () => 'Published',
    classes: 'bg-emerald-600 text-white border-emerald-700',
    icon: Rocket,
  },
  killed: {
    label: () => 'Killed',
    classes: 'bg-gray-100 text-gray-500 border-gray-200 line-through',
    icon: XCircle,
  },
};

export function StatusChip({
  state,
  stage,
  gate,
  className,
}: {
  state: CardState;
  stage: number;
  gate?: string | null;
  className?: string;
}) {
  const meta = META[state];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        meta.classes,
        className,
      )}
    >
      <Icon
        className={cn('h-3.5 w-3.5 shrink-0', meta.pulse && 'motion-safe:animate-spin')}
        aria-hidden="true"
      />
      <span>{meta.label(stage, gate)}</span>
    </span>
  );
}
