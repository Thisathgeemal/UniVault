/** Stepper (aria-current, status words, going back) and CredentialCardPreview (sections). */
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CredentialCardPreview, Stepper } from '../src/index.js';

const STEPS = [
  { id: 'a', label: 'Holder' },
  { id: 'b', label: 'Details' },
  { id: 'c', label: 'Confirm' },
];
const STATUS = { complete: 'completed', current: 'current step', upcoming: 'not started' };

describe('Stepper', () => {
  it('marks the current step, says each state in words, and lets completed steps be chosen', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Stepper label="Steps" steps={STEPS} current={1} statusLabels={STATUS} onSelect={onSelect} />,
    );
    const nav = screen.getByRole('navigation', { name: 'Steps' });
    const items = within(nav).getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[0]).toHaveTextContent('(completed)');
    expect(items[1]).toHaveTextContent('(current step)');
    expect(items[2]).toHaveTextContent('(not started)');
    // Only the completed step is a button
    expect(within(nav).getAllByRole('button')).toHaveLength(1);
    await user.click(within(nav).getByRole('button', { name: /^Holder\s*\(completed\)$/ }));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('without onSelect no step is a button', () => {
    render(<Stepper label="Steps" steps={STEPS} current={2} statusLabels={STATUS} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('CredentialCardPreview', () => {
  it('a named card with named sections, items, badges, notes and a footer', () => {
    render(
      <CredentialCardPreview
        title="KYC credential"
        subtitle="Demo Bank"
        sections={[
          {
            id: 'always',
            title: 'Always shown',
            description: 'Verifiers see these',
            tone: 'muted',
            items: [{ id: 'issuer', label: 'Issuer', value: 'Demo Bank' }],
          },
          {
            id: 'holder',
            title: 'Holder chooses',
            items: [
              { id: 'name', label: 'Full name', value: 'Kasun', badge: <span>SD</span> },
              { id: 'age', label: 'Over 18', value: 'Yes', note: 'Calculated' },
            ],
          },
        ]}
        footer="Bound to the wallet"
      />,
    );
    const card = screen.getByRole('article', { name: 'KYC credential' });
    expect(within(card).getByText('Demo Bank', { selector: 'p' })).toBeInTheDocument();
    const always = within(card).getByRole('region', { name: 'Always shown' });
    expect(always.className).toContain('bg-muted');
    expect(within(always).getByText('Verifiers see these')).toBeInTheDocument();
    const holder = within(card).getByRole('region', { name: 'Holder chooses' });
    expect(within(holder).getByText('SD')).toBeInTheDocument();
    expect(within(holder).getByText('Calculated')).toBeInTheDocument();
    expect(within(card).getByText('Bound to the wallet')).toBeInTheDocument();
  });

  it('works without a footer or descriptions', () => {
    render(
      <CredentialCardPreview
        title="Card"
        subtitle="Issuer"
        sections={[{ id: 's', title: 'Section', items: [] }]}
      />,
    );
    expect(screen.getByRole('article', { name: 'Card' }).querySelector('footer')).toBeNull();
  });
});
