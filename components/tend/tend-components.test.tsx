import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { AiLabel } from './ai-label';
import { EmptyState } from './empty-state';
import { EvidenceChip } from './evidence-chip';
import { FeedbackCard } from './feedback-card';
import { IndicatorTag } from './indicator-tag';
import { LevelStones } from './level-stones';

describe('<LevelStones>', () => {
  it('shows "Seen at Level 2 · next: try Level 3" and fills stones 1–2', () => {
    renderWithIntl(<LevelStones level={2} />);
    const img = screen.getByRole('img', { name: 'Seen at Level 2 · next: try Level 3' });
    const stones = img.querySelectorAll('[data-reached]');
    expect([...stones].map((s) => s.getAttribute('data-reached'))).toEqual(['true', 'true', 'false']);
    expect(screen.getByText('Seen at Level 2 · next: try Level 3')).toBeInTheDocument();
  });

  it('never renders a progress bar, percentage or score', () => {
    const { container } = renderWithIntl(<LevelStones level={1} target={2} />);
    expect(container.querySelector('[role="progressbar"], progress, meter')).toBeNull();
    expect(container.textContent).not.toMatch(/%|score|\/\s*3/i);
  });

  it('handles not-yet-observed and level 3', () => {
    const { unmount, container } = renderWithIntl(<LevelStones level={null} />);
    expect(screen.getByRole('img', { name: 'Not yet observed' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-reached="true"]')).toHaveLength(0);
    unmount();
    renderWithIntl(<LevelStones level={3} />);
    expect(screen.getByRole('img', { name: 'Seen at Level 3 · keep growing it' })).toBeInTheDocument();
  });

  it('marks the target stone', () => {
    const { container } = renderWithIntl(<LevelStones level={1} target={2} />);
    const target = container.querySelector('[data-target="true"]');
    expect(target?.textContent).toBe('L2');
  });

  it('as a picker: radio semantics, 44px targets, calls onSelect', async () => {
    const onSelect = vi.fn();
    renderWithIntl(<LevelStones level={2} onSelect={onSelect} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAccessibleName('Level 1: Basic positive practice');
    for (const r of radios) expect(r.className).toMatch(/h-11/);
    await userEvent.click(radios[2]);
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('renders in Chinese', () => {
    renderWithIntl(<LevelStones level={1} />, { locale: 'zh' });
    expect(screen.getByRole('img', { name: '观察到第1级 · 下一步：尝试第2级' })).toBeInTheDocument();
  });
});

describe('<IndicatorTag>', () => {
  it('shows code + name + level + confidence with the domain colour', () => {
    const { container } = renderWithIntl(<IndicatorTag code="3.3.4" name="Extending Thinking Through Questioning" level={2} confidence={0.86} valence="glow" />);
    const el = container.firstElementChild!;
    expect(el.getAttribute('data-domain')).toBe('3');
    expect(el.className).toMatch(/bg-d3-fill/);
    expect(el.textContent).toContain('3.3.4');
    expect(el.textContent).toContain('Extending Thinking Through Questioning');
    expect(el.textContent).toContain('L2');
    expect(el.textContent).toContain('86% confident');
    // colour is not the only signal: domain name is announced
    expect(el.textContent).toContain('Learning:');
  });

  it.each([
    ['1.1.1', /bg-d1-fill/], ['2.2.4', /bg-d2-fill/], ['3.4.2', /bg-d3-fill/],
  ])('%s uses its domain colour', (code, cls) => {
    const { container } = renderWithIntl(<IndicatorTag code={code} name="x" />);
    expect(container.firstElementChild!.className).toMatch(cls);
  });

  it('marks tags under 55% confidence as "possible"', () => {
    const { container } = renderWithIntl(<IndicatorTag code="3.3.4" name="x" confidence={0.52} />);
    const el = container.firstElementChild!;
    expect(el.getAttribute('data-possible')).toBe('true');
    expect(el.textContent).toContain('possible');
    expect(el.textContent).not.toContain('%');
  });

  it('leader-added tags (no confidence) show no confidence', () => {
    const { container } = renderWithIntl(<IndicatorTag code="1.1.2" name="x" level={3} />);
    expect(container.textContent).not.toMatch(/confident|possible/);
  });
});

describe('<EvidenceChip>', () => {
  it('shows ▶ mm:ss, has a spoken label and seeks on click', async () => {
    const onSeek = vi.fn();
    renderWithIntl(<EvidenceChip ms={604_000} onSeek={onSeek} />);
    const btn = screen.getByRole('button', { name: 'Play evidence at 10 minutes 4 seconds' });
    expect(btn).toHaveTextContent('10:04');
    expect(btn.className).toMatch(/min-h-11/);
    await userEvent.click(btn);
    expect(onSeek).toHaveBeenCalledWith(604_000);
  });

  it('is keyboard operable', async () => {
    const onSeek = vi.fn();
    renderWithIntl(<EvidenceChip ms={1000} onSeek={onSeek} />);
    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSeek).toHaveBeenCalledTimes(1);
  });
});

describe('<FeedbackCard>', () => {
  it.each([
    ['glow', 'Glow', 'What went well'],
    ['grow', 'Grow', 'An opportunity to grow'],
    ['next', 'Next step', 'One step you own'],
  ] as const)('%s card has its heading and hint', (kind, heading, hint) => {
    renderWithIntl(<FeedbackCard kind={kind} text="Some text" />);
    expect(screen.getByRole('article', { name: heading })).toBeInTheDocument();
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('renders one evidence chip per citation', () => {
    renderWithIntl(<FeedbackCard kind="glow" text="You waited for answers." evidence={[{ id: 'a', ms: 61_000 }, { id: 'b', ms: 120_000 }]} />);
    expect(screen.getAllByRole('button', { name: /Play evidence/ })).toHaveLength(2);
  });
});

describe('<EmptyState> and <AiLabel>', () => {
  it('empty state: one sentence and one action', async () => {
    const onAction = vi.fn();
    renderWithIntl(<EmptyState message="No observations yet." actionLabel="Schedule the first one" onAction={onAction} />);
    expect(screen.getByText('No observations yet.')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(onAction).toHaveBeenCalled();
  });

  it('empty state with href renders a link', () => {
    renderWithIntl(<EmptyState message="m" actionLabel="Go" href="/observe" />);
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/observe');
  });

  it('AI label names the reviewer, or says it is a draft', () => {
    const { unmount } = renderWithIntl(<AiLabel reviewer="Sandra Tan" />);
    expect(screen.getByText('Drafted with AI · reviewed by Sandra Tan')).toBeInTheDocument();
    unmount();
    renderWithIntl(<AiLabel />);
    expect(screen.getByText('AI draft · waiting for review')).toBeInTheDocument();
  });
});
