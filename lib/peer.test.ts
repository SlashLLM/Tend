import { describe, expect, it } from 'vitest';
import { actionStage, cpdHours, currentPeerSession, type PeerSessionView } from './peer';

const now = new Date('2026-11-26T10:00:00+08:00');
const s = (o: Partial<PeerSessionView>): PeerSessionView => ({
  id: 'x', status: 'requested', proposed_at: null, scheduled_at: null, peer_note: null, noticed: null, will_try: null, created_at: '2026-11-20T00:00:00Z', ...o,
});
const peer = (sessions: PeerSessionView[], status = 'open') => ({ status, peer_user_id: 'farah', peer_sessions: sessions });

describe('actionStage', () => {
  it('ordinary actions', () => {
    expect(actionStage({ status: 'proposed', peer_user_id: null, peer_sessions: [] }, now)).toBe('awaiting_endorsement');
    expect(actionStage({ status: 'open', peer_user_id: null, peer_sessions: [] }, now)).toBe('open');
    expect(actionStage({ status: 'done', peer_user_id: null, peer_sessions: [] }, now)).toBe('done');
  });
  it('peer actions move through ask → requested → booked → reflect', () => {
    expect(actionStage(peer([], 'proposed'), now)).toBe('awaiting_endorsement');
    expect(actionStage(peer([]), now)).toBe('ask');
    expect(actionStage(peer([s({ status: 'requested' })]), now)).toBe('requested');
    expect(actionStage(peer([s({ status: 'accepted', scheduled_at: '2026-11-28T10:00:00+08:00' })]), now)).toBe('booked');
    expect(actionStage(peer([s({ status: 'accepted', scheduled_at: '2026-11-26T10:30:00+08:00' })]), now)).toBe('reflect'); // within the hour
    expect(actionStage(peer([s({ status: 'accepted', scheduled_at: '2026-11-25T10:00:00+08:00' })]), now)).toBe('reflect');
  });
  it('after a decline or cancellation the educator can ask again', () => {
    expect(actionStage(peer([s({ status: 'declined' })]), now)).toBe('ask');
    expect(actionStage(peer([s({ status: 'cancelled' })]), now)).toBe('ask');
  });
});

describe('currentPeerSession', () => {
  it('prefers the live session over older closed ones', () => {
    const live = s({ id: 'live', status: 'requested', created_at: '2026-11-25T00:00:00Z' });
    const old = s({ id: 'old', status: 'declined', created_at: '2026-11-21T00:00:00Z' });
    expect(currentPeerSession({ peer_sessions: [old, live] })?.id).toBe('live');
    expect(currentPeerSession({ peer_sessions: [old] })?.id).toBe('old');
    expect(currentPeerSession({ peer_sessions: [] })).toBeNull();
  });
});

describe('cpdHours', () => {
  it('counts course hours and logged minutes from done actions only', () => {
    expect(
      cpdHours([
        { status: 'done', cpd_minutes: null, pd: { hours: 12 } },
        { status: 'done', cpd_minutes: 15, pd: null },
        { status: 'done', cpd_minutes: 15, pd: null },
        { status: 'open', cpd_minutes: null, pd: { hours: 7 } },
      ]),
    ).toBe(12.5);
  });
});
