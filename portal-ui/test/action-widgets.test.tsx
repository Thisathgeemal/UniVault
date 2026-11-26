/** Dialog (focus, Tab trap, Escape, busy), ActionMenu (disclosure, disabled reason), FilterTabs, CopyButton. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionMenu, CopyButton, Dialog, FilterTabs } from '../src/index.js';

describe('Dialog', () => {
  function Harness({ busy = false, description }: { busy?: boolean; description?: string }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Dialog
          open={open}
          title="Revoke credential"
          {...(description ? { description } : {})}
          onClose={() => setOpen(false)}
          busy={busy}
          footer={
            <>
              <button onClick={() => setOpen(false)}>Cancel</button>
              <button>Confirm</button>
            </>
          }
        >
          <input aria-label="Note" />
        </Dialog>
      </>
    );
  }

  it('is a labelled modal: focus moves in, Tab stays inside, Escape closes, focus returns', async () => {
    const user = userEvent.setup();
    render(<Harness description="Employment credential for Nimesha" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke credential' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Employment credential for Nimesha');
    expect(screen.getByLabelText('Note')).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
    await user.tab(); // wraps to the first control
    expect(screen.getByLabelText('Note')).toHaveFocus();
    await user.tab({ shift: true }); // and back to the last
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('ignores Escape while busy and has no description when none is given', async () => {
    const user = userEvent.setup();
    render(<Harness busy />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('aria-describedby');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Other keys and Tab in the middle do nothing special
    fireEvent.keyDown(document, { key: 'a' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does nothing on Tab when it has no focusable content', () => {
    render(
      <Dialog open title="Empty" onClose={() => {}} footer={null}>
        <p>Nothing to focus</p>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('dialog', { name: 'Empty' })).toBeInTheDocument();
  });
});

describe('ActionMenu', () => {
  const items = (onRevoke = vi.fn(), onReissue = vi.fn()) => [
    { id: 'reissue', label: 'Reissue', onSelect: onReissue },
    {
      id: 'revoke',
      label: 'Revoke',
      tone: 'destructive' as const,
      onSelect: onRevoke,
      disabled: true,
      disabledReason: 'Only administrators can revoke credentials',
    },
    { id: 'danger', label: 'Delete', tone: 'destructive' as const, onSelect: vi.fn() },
  ];

  it('opens a list of actions, runs one and closes; a disabled one explains itself', async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    const onReissue = vi.fn();
    render(
      <ActionMenu
        label="Actions for Nimesha"
        trigger="Actions"
        items={items(onRevoke, onReissue)}
      />,
    );
    const button = screen.getByRole('button', { name: 'Actions for Nimesha' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Reissue' })).toHaveFocus();
    const revoke = screen.getByRole('button', { name: /Revoke/ });
    expect(revoke).toHaveAttribute('aria-disabled', 'true');
    expect(revoke).toHaveAccessibleDescription('Only administrators can revoke credentials');
    await user.click(revoke);
    expect(onRevoke).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Reissue' }));
    expect(onReissue).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape (focus back on the button) and on a click outside', async () => {
    const user = userEvent.setup();
    render(
      <>
        <p>Outside</p>
        <ActionMenu label="Actions" trigger="…" items={items()} />
      </>,
    );
    const button = screen.getByRole('button', { name: 'Actions' });
    await user.click(button);
    fireEvent.keyDown(document, { key: 'ArrowDown' }); // not handled
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
    await user.click(button);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Reissue' })); // inside: stays open
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseDown(screen.getByText('Outside'));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders nothing without items', () => {
    const { container } = render(<ActionMenu label="Actions" trigger="…" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FilterTabs', () => {
  it('is a group of toggle buttons with counts; selecting calls back', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FilterTabs
        label="Filter by status"
        selected="valid"
        onSelect={onSelect}
        tabs={[
          { id: 'all', label: 'All', count: '12' },
          { id: 'valid', label: 'Active', count: '7' },
          { id: 'expired', label: 'Expired' },
        ]}
      />,
    );
    const group = screen.getByRole('group', { name: 'Filter by status' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active 7' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All 12' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Expired' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expired' }));
    expect(onSelect).toHaveBeenCalledWith('expired');
  });
});

describe('CopyButton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies the value, says "Copied" for two seconds, then returns to its label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onParentClick = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onParentClick}>
        <CopyButton
          value="e0000000-full-id"
          label="Copy credential ID e0000000"
          copiedLabel="Copied"
        />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy credential ID e0000000' }));
    expect(writeText).toHaveBeenCalledWith('e0000000-full-id');
    expect(onParentClick).not.toHaveBeenCalled(); // a table row click is not triggered
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByText('Copied', { selector: '[aria-live]' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole('button', { name: 'Copy credential ID e0000000' })).toBeInTheDocument();
  });

  it('stays on its label when copying fails or no clipboard exists', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CopyButton value="x" label="Copy" copiedLabel="Copied" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });
});
