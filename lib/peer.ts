/**
 * Plan actions and peer observations: shapes and the stage an action is in (pure; used by server + client).
 */
export type PeerSessionView = {
  id: string;
  status: 'requested' | 'accepted' | 'declined' | 'cancelled' | 'done';
  proposed_at: string | null;
  scheduled_at: string | null;
  peer_note: string | null;
  noticed: string | null;
  will_try: string | null;
  created_at: string;
};

export type ActionView = {
  id: string;
  description: string;
  status: string;
  source: string;
  endorsed_by: string | null;
  pd_activity_id: string | null;
  peer_user_id: string | null;
  completed_at: string | null;
  completion_note: string | null;
  cpd_minutes: number | null;
  peer: { full_name: string } | null;
  peer_sessions: PeerSessionView[];
};

/** The session that matters now: the live one, else the latest one. */
export function currentPeerSession(a: Pick<ActionView, 'peer_sessions'>): PeerSessionView | null {
  const s = [...(a.peer_sessions ?? [])].sort((x, y) => y.created_at.localeCompare(x.created_at));
  return s.find((x) => x.status === 'requested' || x.status === 'accepted') ?? s.find((x) => x.status === 'done') ?? s[0] ?? null;
}

/** How early the reflection can be recorded (matches complete_peer_observation in migration 0008). */
export const REFLECT_GRACE_MS = 60 * 60 * 1000;

export type ActionStage =
  | 'awaiting_endorsement' // educator proposed it; the leader hasn't endorsed
  | 'open' // ordinary action, can be marked done
  | 'ask' // peer action endorsed, no live request (never asked, or declined/cancelled)
  | 'requested' // waiting for the colleague to answer
  | 'booked' // colleague accepted; session is in the future
  | 'reflect' // session time has come: record what you noticed
  | 'done'
  | 'declined'; // the leader declined the action

export function actionStage(a: Pick<ActionView, 'status' | 'peer_user_id' | 'peer_sessions'>, now: Date): ActionStage {
  if (a.status === 'proposed') return 'awaiting_endorsement';
  if (a.status === 'done') return 'done';
  if (a.status === 'declined') return 'declined';
  if (!a.peer_user_id) return 'open';
  const s = currentPeerSession(a);
  if (!s || s.status === 'declined' || s.status === 'cancelled') return 'ask';
  if (s.status === 'requested') return 'requested';
  if (s.status === 'accepted') return s.scheduled_at && new Date(s.scheduled_at).getTime() > now.getTime() + REFLECT_GRACE_MS ? 'booked' : 'reflect';
  return 'done';
}

/** CPD hours from completed actions: a course's listed hours, or the minutes logged (e.g. 15 for a peer observation). */
export function cpdHours(done: { status: string; cpd_minutes: number | null; pd: { hours: number | null } | null }[]): number {
  const h = done.filter((a) => a.status === 'done').reduce((s, a) => s + (a.cpd_minutes != null ? a.cpd_minutes / 60 : Number(a.pd?.hours ?? 0)), 0);
  return Math.round(h * 100) / 100;
}
