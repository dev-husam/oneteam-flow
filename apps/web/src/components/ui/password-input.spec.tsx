import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { en } from '@pt/i18n';
import { passwordStrength, PasswordInput } from './password-input';

const renderInput = (value: string, email?: string) =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PasswordInput aria-label="pw" strengthOf={value} email={email} readOnly />
    </NextIntlClientProvider>,
  );

describe('passwordStrength', () => {
  it('rates by the shared policy', () => {
    expect(passwordStrength('short')).toBe('weak');
    expect(passwordStrength('correct horse')).toBe('fair');
    expect(passwordStrength('correct horse battery staple')).toBe('strong');
  });
});

describe('PasswordInput', () => {
  it('shows unmet rules while typing a weak password', () => {
    renderInput('abc');
    expect(screen.getByText(/Password strength: Weak/)).toBeInTheDocument();
    expect(screen.getByText(/Use at least 10 characters/)).toBeInTheDocument();
  });

  it('shows no meter for an empty value', () => {
    renderInput('');
    expect(screen.queryByText(/Password strength/)).not.toBeInTheDocument();
  });

  it('toggles visibility with an accessible button', async () => {
    renderInput('correct horse battery staple');
    const input = screen.getByLabelText('pw');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true');
  });
});
