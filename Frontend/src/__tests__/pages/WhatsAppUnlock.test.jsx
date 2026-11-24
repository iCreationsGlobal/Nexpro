import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const service = vi.hoisted(() => ({ checkUnlock: vi.fn(), unlock: vi.fn() }));
vi.mock('@/services/absWhatsAppService', () => ({ default: service }));
vi.mock('@/components/AppLogo', () => ({ AuthBrandMark: () => <span>ABS</span> }));

import WhatsAppUnlock from '@/pages/WhatsAppUnlock';

const failed = (status, message) => Object.assign(new Error('x'), { response: { status, data: { message } } });
const open = () => render(<MemoryRouter initialEntries={['/wa/tok']}><Routes><Route path="/wa/:token" element={<WhatsAppUnlock />} /></Routes></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); service.checkUnlock.mockResolvedValue({ success: true }); });
afterEach(cleanup);

describe('the PIN page of ABS on WhatsApp', () => {
  const enter = async (pin) => {
    await userEvent.type(await screen.findByLabelText('PIN'), pin);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  };

  it('takes the PIN and sends them back to WhatsApp', async () => {
    service.unlock.mockResolvedValue({ chatUrl: 'https://wa.me/233500000000' });
    open();
    await enter('2580');
    expect(service.unlock).toHaveBeenCalledWith('tok', '2580');
    expect(await screen.findByRole('link', { name: 'Open WhatsApp' })).toHaveAttribute('href', 'https://wa.me/233500000000');
  });

  it('hides the PIN and takes digits only', async () => {
    open();
    const field = await screen.findByLabelText('PIN');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.type(field, 'a2b5');
    expect(field).toHaveValue('25');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('4 to 6 digits');
    expect(service.unlock).not.toHaveBeenCalled();
  });

  it('says a wrong PIN is wrong and lets them try again', async () => {
    service.unlock.mockRejectedValueOnce(failed(400, 'That PIN is wrong. 4 tries left.'));
    open();
    await enter('1111');
    expect(await screen.findByRole('alert')).toHaveTextContent('4 tries left');
    expect(screen.getByLabelText('PIN')).toHaveValue('');
  });

  it.each([[423, 'Too many wrong PINs.'], [404, 'This link has expired.']])('ends on %i', async (status, message) => {
    service.unlock.mockRejectedValueOnce(failed(status, message));
    open();
    await enter('1111');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
  });

  it('an expired link says so; a bad connection does not end it', async () => {
    service.checkUnlock.mockRejectedValueOnce(failed(404, 'x'));
    const { unmount } = open();
    expect(await screen.findByRole('alert')).toHaveTextContent('This link has expired');
    unmount();
    service.checkUnlock.mockRejectedValueOnce(new Error('Network Error'));
    service.unlock.mockRejectedValueOnce(new Error('Network Error'));
    open();
    await enter('2580');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach ABS');
    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
  });
});
