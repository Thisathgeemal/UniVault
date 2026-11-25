/** shadcn/ui-style primitives: semantics, variants and class merging. */
import { render, screen } from '@testing-library/react';
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

describe('primitives', () => {
  it('Button defaults to type="button" and merges classes', () => {
    render(
      <Button variant="outline" size="sm" className="px-8">
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
        appName="App"
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
});
