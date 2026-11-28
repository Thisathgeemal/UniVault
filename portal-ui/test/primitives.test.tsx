/** shadcn/ui-style primitives: semantics, variants and class merging. */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Header,
  Input,
  Label,
  PageHeader,
} from '../src/index.js';

function TagIcon(props: { className?: string }) {
  return <svg data-testid="tag-icon" {...props} />;
}

describe('primitives', () => {
  it('Button defaults to type="button" and merges classes', () => {
    render(
      <Button variant="secondary" size="sm" className="px-8">
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('px-8');
    expect(button.className).not.toContain('px-3'); // tailwind-merge resolved the conflict
  });

  it('Label is associated with its Input', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" aria-invalid="true" />
      </>,
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('Card renders a heading, description and content', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
          <CardDescription>Details</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Organisation' })).toBeInTheDocument();
    expect(screen.getByTestId('card')).toHaveTextContent('DetailsBody');
  });

  it('Alert takes the role the caller gives (alert for errors, status for notices)', () => {
    render(
      <>
        <Alert role="alert" variant="destructive">
          Failed
        </Alert>
        <Alert role="status">Saved</Alert>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('Badge and cn', () => {
    render(<Badge variant="outline">Admin</Badge>);
    expect(screen.getByText('Admin').className).toContain('border');
    expect(cn('p-2', false, 'p-4')).toBe('p-4');
  });

  it('EmptyState and PageHeader work without their optional parts', () => {
    render(
      <>
        <PageHeader title="Only a title" />
        <EmptyState title="Nothing here" />
      </>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Only a title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing here' })).toBeInTheDocument();
  });

  it('Header without a menu button, with logout disabled while pending', () => {
    render(
      <Header
        appName="UniVault"
        roleTag={{ label: 'Verifier portal', icon: TagIcon }}
        orgName="Org"
        userName="User"
        roleLabel="Officer"
        logoutLabel="Sign out"
        onLogout={() => undefined}
        logoutPending
      />,
    );
    expect(screen.queryByRole('button', { name: /menu/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  });

  it('Header is the navy top bar with the role tag passed in (label and icon)', () => {
    render(
      <Header
        appName="UniVault"
        roleTag={{ label: 'Verifier portal', icon: TagIcon }}
        orgName="Org"
        userName="User"
        roleLabel="Officer"
        logoutLabel="Sign out"
        onLogout={() => undefined}
      />,
    );
    const header = screen.getByRole('banner');
    expect(header.className).toContain('bg-brand');
    expect(header.className).toContain('text-on-brand');
    const tag = screen.getByTestId('role-tag');
    expect(tag).toHaveTextContent('Verifier portal');
    for (const cls of ['bg-role-tag-bg', 'text-on-brand', 'rounded-pill']) {
      expect(tag.className).toContain(cls);
    }
    expect(within(tag).getByTestId('tag-icon')).toHaveAttribute('aria-hidden', 'true');
    // actions in the bar are on-brand buttons, never azure
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveAttribute(
      'data-variant',
      'onBrand',
    );
  });

  it.each([
    ['primary', 'bg-accent', 'text-on-accent'],
    ['secondary', 'border-border-strong', 'text-text'],
    ['text', 'text-accent-text', 'hover:underline'],
    ['destructive', 'bg-status-revoked', 'text-on-status-revoked'],
    ['onBrand', 'bg-role-tag-bg', 'text-on-brand'],
  ] as const)(
    'Button %s uses the design-system tokens, 40px min and radius-md',
    (variant, a, b) => {
      render(<Button variant={variant}>Act</Button>);
      const button = screen.getByRole('button', { name: 'Act' });
      for (const cls of [a, b, 'min-h-10', 'rounded-md']) expect(button.className).toContain(cls);
      expect(button).toHaveAttribute('data-variant', variant);
    },
  );
});
