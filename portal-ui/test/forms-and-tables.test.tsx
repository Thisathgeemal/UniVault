/**
 * Building blocks for lists and forms (holder pages now, verifier portal later): DataTable,
 * Pagination, SearchInput (debounce), FormField (ARIA wiring), ErrorSummary (focus, links),
 * StatusBadge, Toast, ConfirmDialog (focus, Escape, Tab trap), Tooltip and Select.
 */
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConfirmDialog,
  DataTable,
  ErrorSummary,
  FormField,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  ToastProvider,
  Tooltip,
  useToast,
  type DataTableColumn,
  type DataTableSort,
} from '../src/index.js';

afterEach(() => vi.useRealTimers());

interface Row {
  id: string;
  name: string;
  ref: string;
}
const ROWS: Row[] = [
  { id: '1', name: 'Amal', ref: 'A-1' },
  { id: '2', name: 'Bimal', ref: 'B-2' },
];
const COLUMNS: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', sortable: true, cell: (r) => r.name },
  { id: 'ref', header: 'Reference', sortable: true, cell: (r) => r.ref, className: 'font-mono' },
  { id: 'plain', header: 'Plain', cell: () => '–' },
];

describe('DataTable', () => {
  it('renders a captioned table; sort buttons with aria-sort; toggles direction; row clicks', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn<(sort: DataTableSort) => void>();
    const onRow = vi.fn<(row: Row) => void>();
    render(
      <DataTable
        caption="People"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        sort={{ column: 'name', direction: 'asc' }}
        onSortChange={onSort}
        onRowClick={onRow}
      />,
    );
    const table = screen.getByRole('table', { name: 'People' });
    const [name, ref, plain] = within(table).getAllByRole('columnheader');
    expect(name).toHaveAttribute('aria-sort', 'ascending');
    expect(ref).toHaveAttribute('aria-sort', 'none');
    expect(plain).not.toHaveAttribute('aria-sort');
    expect(within(plain!).queryByRole('button')).not.toBeInTheDocument();

    await user.click(within(name!).getByRole('button', { name: 'Name' }));
    expect(onSort).toHaveBeenLastCalledWith({ column: 'name', direction: 'desc' });
    await user.click(within(ref!).getByRole('button', { name: 'Reference' }));
    expect(onSort).toHaveBeenLastCalledWith({ column: 'ref', direction: 'asc' });

    await user.click(screen.getByText('B-2'));
    expect(onRow).toHaveBeenCalledWith(ROWS[1]);
    expect(screen.getByText('B-2').className).toContain('font-mono');
  });

  it('descending sort, plain headings without onSortChange, rows without click, loading rows', () => {
    const { rerender } = render(
      <DataTable
        caption="People"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        sort={{ column: 'ref', direction: 'desc' }}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Reference' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')[1]!.className).not.toContain('cursor-pointer');

    rerender(
      <DataTable
        caption="People"
        columns={COLUMNS}
        rows={[]}
        getRowId={(r) => r.id}
        loading
        loadingRows={3}
      />,
    );
    expect(screen.getAllByTestId('data-table-loading-row')).toHaveLength(3);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });

  it('a descending sorted column shows its sort button with the down arrow', () => {
    render(
      <DataTable
        caption="People"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        sort={{ column: 'name', direction: 'desc' }}
        onSortChange={() => undefined}
      />,
    );
    const button = screen.getByRole('button', { name: 'Name' });
    expect(button.querySelector('svg path')).toHaveAttribute('d', 'M12 5v14M19 12l-7 7-7-7');
  });
});

describe('Pagination', () => {
  const labels = {
    navigation: 'Pages',
    previous: 'Previous',
    next: 'Next',
    summary: '1–20 of 45',
    pageSize: 'Rows per page',
  };

  it('previous / next within bounds, a live summary and a page-size choice', async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    const onSize = vi.fn();
    const { rerender } = render(
      <Pagination
        page={1}
        pageSize={20}
        total={45}
        onPageChange={onPage}
        pageSizeOptions={[10, 20, 50]}
        onPageSizeChange={onSize}
        labels={labels}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(nav).getByText('1–20 of 45')).toHaveAttribute('aria-live', 'polite');
    expect(within(nav).getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(within(nav).getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
    await user.selectOptions(within(nav).getByRole('combobox', { name: 'Rows per page' }), '50');
    expect(onSize).toHaveBeenCalledWith(50);

    rerender(
      <Pagination page={3} pageSize={20} total={45} onPageChange={onPage} labels={labels} />,
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenLastCalledWith(2);

    rerender(<Pagination page={1} pageSize={20} total={0} onPageChange={onPage} labels={labels} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled(); // one (empty) page
  });
});

describe('SearchInput', () => {
  function Harness({ onSearch }: { onSearch: (v: string) => void }) {
    const [value, setValue] = useState('start');
    return (
      <>
        <SearchInput
          label="Search"
          clearLabel="Clear search"
          value={value}
          onSearch={(v) => {
            onSearch(v);
            setValue(v);
          }}
          placeholder="Name"
        />
        <button type="button" onClick={() => setValue('from outside')}>
          set
        </button>
      </>
    );
  }

  it('reports the trimmed text once, after the pause', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);
    const box = screen.getByRole('searchbox', { name: 'Search' });
    expect(box).toHaveValue('start');
    expect(box).toHaveAttribute('placeholder', 'Name');
    fireEvent.change(box, { target: { value: 'ab' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(box, { target: { value: ' abc ' } });
    act(() => vi.advanceTimersByTime(299));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('abc');
  });

  it('Enter searches at once, clear empties it, an outside change replaces the text', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);
    const box = screen.getByRole('searchbox');
    await user.clear(box);
    await user.type(box, 'x{Enter}');
    expect(onSearch).toHaveBeenCalledWith('x');
    await user.type(box, '{Enter}'); // unchanged: no second search
    expect(onSearch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onSearch).toHaveBeenLastCalledWith('');
    expect(box).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'set' }));
    expect(box).toHaveValue('from outside');
  });

  it('uses a given id', () => {
    render(
      <SearchInput id="q" label="Find" clearLabel="Clear" value="" onSearch={() => undefined} />,
    );
    expect(screen.getByRole('searchbox', { name: 'Find' })).toHaveAttribute('id', 'q');
  });
});

describe('FormField', () => {
  it('wires label, hint, error, aria-invalid, aria-required and aria-describedby', () => {
    const { rerender } = render(
      <FormField id="name" label="Full name" required hint="As on the ID" error="Enter a name.">
        {(control) => <input {...control} />}
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: 'Full name' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'name-hint name-error');
    expect(input).toHaveAccessibleDescription('As on the ID Enter a name.');

    rerender(
      <FormField id="name" label="Full name">
        {(control) => <input {...control} />}
      </FormField>,
    );
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-required');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });
});

describe('ErrorSummary', () => {
  it('renders nothing without errors', () => {
    const { container } = render(
      <ErrorSummary title="There is a problem" errors={[]} focusKey={1} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('takes focus when focusKey changes; links focus their field; plain items have no link', async () => {
    const user = userEvent.setup();
    const errors = [
      { fieldId: 'city', message: 'City: Enter a city.' },
      { message: 'shoe_size: Not allowed.' },
    ];
    const { rerender } = render(
      <>
        <ErrorSummary title="There is a problem" errors={errors} />
        <input id="city" aria-label="City" />
      </>,
    );
    const summary = screen.getByRole('alert', { name: 'There is a problem' });
    expect(summary).not.toHaveFocus(); // no focusKey: no focus
    rerender(
      <>
        <ErrorSummary title="There is a problem" errors={errors} focusKey={1} />
        <input id="city" aria-label="City" />
      </>,
    );
    expect(summary).toHaveFocus();
    expect(within(summary).getByText('shoe_size: Not allowed.').closest('a')).toBeNull();
    await user.click(within(summary).getByRole('link', { name: 'City: Enter a city.' }));
    expect(screen.getByRole('textbox', { name: 'City' })).toHaveFocus();
  });
});

describe('StatusBadge', () => {
  it.each(['success', 'warning', 'danger', 'info', 'neutral'] as const)('tone %s', (tone) => {
    render(<StatusBadge tone={tone}>Active</StatusBadge>);
    expect(screen.getByText('Active')).toHaveAttribute('data-tone', tone);
  });
});

describe('Toast', () => {
  function ShowButton({ tone }: { tone?: 'success' | 'info' | 'error' }) {
    const toast = useToast();
    return (
      <button
        type="button"
        onClick={() => toast.show(tone ? { message: `Saved ${tone}`, tone } : { message: 'Saved' })}
      >
        show
      </button>
    );
  }

  it('shows a toast in a polite live region; it closes itself or with the close button', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider closeLabel="Close" durationMs={1000}>
        <ShowButton />
        <ShowButton tone="error" />
      </ToastProvider>,
    );
    const region = screen.getByTestId('toast-region');
    expect(region).toHaveAttribute('aria-live', 'polite');
    const [plain, error] = screen.getAllByRole('button', { name: 'show' });
    fireEvent.click(plain!);
    fireEvent.click(error!);
    expect(within(region).getByText('Saved').parentElement).toHaveAttribute('data-tone', 'success');
    expect(within(region).getByText('Saved error').parentElement).toHaveAttribute(
      'data-tone',
      'error',
    );
    fireEvent.click(within(region).getAllByRole('button', { name: 'Close' })[1]!);
    expect(within(region).queryByText('Saved error')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(within(region).queryByText('Saved')).not.toBeInTheDocument();
  });

  it('clears pending timers on unmount; useToast needs the provider', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <ToastProvider closeLabel="Close">
        <ShowButton tone="info" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useToast())).toThrow(/inside <ToastProvider>/);
  });
});

describe('ConfirmDialog', () => {
  function Harness({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          leave
        </button>
        <ConfirmDialog
          open={open}
          title="Leave without saving?"
          message="Your changes will be lost."
          confirmLabel="Leave page"
          cancelLabel="Stay"
          tone="destructive"
          onConfirm={onConfirm}
          onCancel={() => setOpen(false)}
        />
      </>
    );
  }

  it('starts on Stay, keeps Tab inside, Escape cancels and focus returns', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    const opener = screen.getByRole('button', { name: 'leave' });
    await user.click(opener);
    const dialog = screen.getByRole('alertdialog', { name: 'Leave without saving?' });
    expect(dialog).toHaveAccessibleDescription('Your changes will be lost.');
    const stay = within(dialog).getByRole('button', { name: 'Stay' });
    const leave = within(dialog).getByRole('button', { name: 'Leave page' });
    expect(stay).toHaveFocus();
    await user.tab();
    expect(leave).toHaveFocus();
    await user.tab(); // wraps around
    expect(stay).toHaveFocus();
    await user.tab({ shift: true });
    expect(leave).toHaveFocus();
    await user.keyboard('a'); // other keys do nothing
    expect(leave).toHaveFocus();
    await user.click(leave);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('a default-tone dialog uses the primary button', async () => {
    render(
      <ConfirmDialog
        open
        title="Sure?"
        message="Really."
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Yes' }).className).toContain('bg-primary');
    // Tab from the middle of nothing special: focus stays inside the dialog
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'No' })).toHaveFocus();
  });
});

describe('Tooltip and Select', () => {
  it('Tooltip describes its trigger', () => {
    render(
      <Tooltip content="Available in the next update">
        {(trigger) => (
          <button type="button" aria-disabled="true" {...trigger}>
            Issue credential
          </button>
        )}
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Issue credential' })).toHaveAccessibleDescription(
      'Available in the next update',
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('Available in the next update');
  });

  it('Select is a styled native select', () => {
    render(
      <Select aria-label="District" className="w-40" defaultValue="Kandy">
        <option>Kandy</option>
      </Select>,
    );
    expect(screen.getByRole('combobox', { name: 'District' }).className).toContain('w-40');
  });
});
