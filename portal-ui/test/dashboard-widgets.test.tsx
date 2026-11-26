/** StatCard, StackedBar and Skeleton: accessible names, links, loading and proportions. */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, StackedBar, StatCard, type StatCardLinkProps } from '../src/index.js';

describe('StatCard', () => {
  it('is a link named "<label> <value>" with the description attached', () => {
    render(
      <StatCard
        label="Active"
        value="1,234"
        description="Credentials currently valid"
        href="/credentials?effectiveStatus=valid"
        size="lg"
      />,
    );
    const link = screen.getByRole('link', { name: 'Active 1,234' });
    expect(link).toHaveAttribute('href', '/credentials?effectiveStatus=valid');
    expect(link).toHaveAccessibleDescription('Credentials currently valid');
    expect(screen.getByText('1,234').className).toContain('text-4xl');
  });

  it('uses the link component it is given (router adapter)', () => {
    function TestLink({ href, children, ...props }: StatCardLinkProps) {
      return (
        <a href={`#router${href}`} data-router="yes" {...props}>
          {children}
        </a>
      );
    }
    render(<StatCard label="Revoked" value="0" href="/credentials" linkComponent={TestLink} />);
    const link = screen.getByRole('link', { name: 'Revoked 0' });
    expect(link).toHaveAttribute('data-router', 'yes');
    expect(link).toHaveAttribute('href', '#router/credentials');
    expect(link).not.toHaveAttribute('aria-describedby'); // no description given
  });

  it('without href is a labelled group, with an optional icon hidden from assistive tech', () => {
    render(<StatCard label="Holders" value="25" icon={<svg data-testid="icon" />} />);
    expect(screen.getByRole('group', { name: 'Holders 25' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('25').className).toContain('text-2xl');
  });

  it('shows a skeleton instead of the value while loading (named by its label only)', () => {
    render(<StatCard label="Issued" value="—" href="/credentials" loading />);
    expect(screen.getByRole('link', { name: 'Issued' })).toBeInTheDocument();
    expect(screen.getByTestId('stat-skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});

describe('StackedBar', () => {
  const segments = [
    { id: 'active', label: 'Active', value: 6, valueText: '6 (60%)', tone: 'brand' as const },
    {
      id: 'revoked',
      label: 'Revoked',
      value: 3,
      valueText: '3 (30%)',
      tone: 'destructive' as const,
    },
    { id: 'superseded', label: 'Superseded', value: 0, valueText: '0 (0%)', tone: 'info' as const },
    { id: 'expired', label: 'Expired', value: 1, valueText: '1 (10%)', tone: 'warning' as const },
  ];

  it('is a named figure whose legend gives every label and number in text', () => {
    render(<StackedBar label="Status breakdown" segments={segments} />);
    const figure = screen.getByRole('figure', { name: 'Status breakdown' });
    const items = within(figure).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Active6 (60%)',
      'Revoked3 (30%)',
      'Superseded0 (0%)',
      'Expired1 (10%)',
    ]);
    expect(screen.getByTestId('stacked-bar')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws proportional segments, skipping zeros, with no inline style', () => {
    const { container } = render(<StackedBar label="Status" segments={segments} />);
    const rects = [...container.querySelectorAll('rect')];
    expect(rects.map((r) => r.getAttribute('data-segment'))).toEqual([
      'active',
      'revoked',
      'expired',
    ]);
    expect(rects.map((r) => Number(r.getAttribute('x')))).toEqual([0, 60, 90]);
    // A small gap between neighbours; the last segment runs to the end
    expect(Number(rects[0]!.getAttribute('width'))).toBeCloseTo(59.4);
    expect(Number(rects[2]!.getAttribute('width'))).toBeCloseTo(10);
    expect(rects[1]!.getAttribute('class')).toBe('fill-destructive');
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('draws an empty bar when every value is zero, keeping the legend', () => {
    const zeros = segments.map((s) => ({ ...s, value: 0, valueText: '0' }));
    const { container } = render(<StackedBar label="Status" segments={zeros} />);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('gives each tone its own fill and swatch colour', () => {
    const tones = (['brand', 'destructive', 'info', 'warning', 'muted'] as const).map((tone) => ({
      id: tone,
      label: tone,
      value: 1,
      valueText: '1',
      tone,
    }));
    const { container } = render(<StackedBar label="Tones" segments={tones} />);
    const fills = [...container.querySelectorAll('rect')].map((r) => r.getAttribute('class'));
    expect(new Set(fills).size).toBe(5);
    const swatches = [...container.querySelectorAll('li > span[aria-hidden]')].map(
      (s) => s.className,
    );
    expect(new Set(swatches).size).toBe(5);
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive technology and merges classes', () => {
    render(<Skeleton data-testid="sk" className="h-4 w-10" />);
    const sk = screen.getByTestId('sk');
    expect(sk).toHaveAttribute('aria-hidden', 'true');
    expect(sk.className).toContain('animate-pulse');
    expect(sk.className).toContain('w-10');
  });
});
