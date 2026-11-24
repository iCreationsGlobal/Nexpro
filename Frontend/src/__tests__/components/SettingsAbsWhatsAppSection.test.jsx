import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const service = vi.hoisted(() => ({ getStatus: vi.fn(), connect: vi.fn(), changePin: vi.fn(), useHere: vi.fn(), disconnect: vi.fn() }));
const toasts = vi.hoisted(() => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/services/absWhatsAppService', () => ({ default: service }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ activeTenant: { id: 't1' } }) }));
vi.mock('@/utils/toast', () => toasts);
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,x' } }));

import SettingsAbsWhatsAppSection from '@/components/settings/sections/SettingsAbsWhatsAppSection';
import { getVisibleSettingsCards } from '@/utils/settingsRoutes';

const NOT_YET = { available: true, connected: false, number: '233500000000', chatUrl: 'https://wa.me/233500000000' };
const CONNECTED = { ...NOT_YET, connected: true, phoneEnding: '0001', businessName: 'Adom Stores', shopName: 'Osu', here: true, pinLocked: false };
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SettingsAbsWhatsAppSection /></QueryClientProvider>);

beforeEach(() => { vi.clearAllMocks(); service.getStatus.mockResolvedValue(NOT_YET); });
afterEach(cleanup);

const choosePin = async (pin, again = pin) => {
  await userEvent.type(await screen.findByLabelText('PIN'), pin);
  await userEvent.type(screen.getByLabelText('PIN again'), again);
};

describe('ABS on WhatsApp in Settings', () => {
  it('connects: a PIN, then the message to send, then it sees the connection', async () => {
    service.connect.mockResolvedValue({ words: 'Connect ABS 7K4M-9QX2', chatUrl: 'https://wa.me/233500000000?text=x', expiresAt: new Date(Date.now() + 900_000).toISOString() });
    open();
    await choosePin('2580');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(service.connect.mock.calls[0][0]).toBe('2580');
    expect(await screen.findByText('Connect ABS 7K4M-9QX2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open WhatsApp' })).toHaveAttribute('href', 'https://wa.me/233500000000?text=x');
    service.getStatus.mockResolvedValue(CONNECTED);
    await waitFor(() => expect(screen.getByText('The WhatsApp number ending 0001')).toBeInTheDocument(), { timeout: 6000 });
    expect(toasts.showSuccess).toHaveBeenCalledWith('WhatsApp connected.');
  }, 15000);

  it('checks the PIN before sending it', async () => {
    open();
    await choosePin('25', '25');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('4 to 6 digits');
    await choosePin('80', '81');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('not the same');
    expect(service.connect).not.toHaveBeenCalled();
  });

  it('an expired message can be started again', async () => {
    service.connect.mockResolvedValue({ words: 'Connect ABS 7K4M-9QX2', chatUrl: 'https://wa.me/1', expiresAt: new Date(Date.now() - 1).toISOString() });
    open();
    await choosePin('2580');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('That message has expired.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(await screen.findByLabelText('PIN again')).toBeInTheDocument();
  });

  it('shows what it answers about, and points it here when it is elsewhere', async () => {
    service.getStatus.mockResolvedValue({ ...CONNECTED, shopName: 'Tema', here: false });
    service.useHere.mockResolvedValue(CONNECTED);
    open();
    expect(await screen.findByText('Adom Stores, Tema')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Answer about what I have open now' }));
    expect(await screen.findByText('Adom Stores, Osu')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Answer about what I have open now' })).not.toBeInTheDocument();
  });

  it('a locked one takes a new PIN', async () => {
    service.getStatus.mockResolvedValue({ ...CONNECTED, pinLocked: true });
    service.changePin.mockResolvedValue({ ...CONNECTED, pinLocked: false });
    open();
    expect(await screen.findByText(/Locked after 5 wrong PINs/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change PIN' }));
    await choosePin('7391');
    await userEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
    await waitFor(() => expect(screen.queryByText(/Locked after/)).not.toBeInTheDocument());
    expect(service.changePin.mock.calls[0][0]).toBe('7391');
  });

  it('asks before disconnecting', async () => {
    service.getStatus.mockResolvedValue(CONNECTED);
    service.disconnect.mockImplementation(async () => { service.getStatus.mockResolvedValue(NOT_YET); });
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(service.disconnect).not.toHaveBeenCalled();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByLabelText('PIN again')).toBeInTheDocument();
  });

  it('says when it is not available or could not load', async () => {
    service.getStatus.mockResolvedValue({ available: false, connected: false });
    const { unmount } = open();
    expect(await screen.findByText(/isn't available yet/)).toBeInTheDocument();
    unmount();
    service.getStatus.mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('is listed only for managers, and only once it is switched on', () => {
    const listed = (options) => getVisibleSettingsCards({ hasFeature: () => true, businessType: 'shop', ...options }).some((card) => card.slug === 'abs-whatsapp');
    expect(listed({ isManager: true, hasAbsWhatsApp: true })).toBe(true);
    expect(listed({ isManager: true, hasAbsWhatsApp: false })).toBe(false);
    expect(listed({ isManager: true })).toBe(false);
    expect(listed({ isManager: false, hasAbsWhatsApp: true })).toBe(false);
  });
});
