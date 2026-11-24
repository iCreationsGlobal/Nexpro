import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import OnlineStoreDashboard from '../../components/store/OnlineStoreDashboard';

vi.mock('../../components/store/StoreProductsPanel', () => ({ default: () => null }));

afterEach(cleanup);

const Editor = ({ onSave }) => {
  const [editOpen, setEditOpen] = useState(true);
  const [layoutOpen, setLayoutOpen] = useState(false);
  return (
    <MemoryRouter>
      <OnlineStoreDashboard
        storeName="Demo"
        liveStoreUrl=""
        isPublished
        domainStatus="none"
        domainInput=""
        onDomainInputChange={vi.fn()}
        onChangeTemplate={vi.fn()}
        editOpen={editOpen}
        onEditOpenChange={setEditOpen}
        productGrid={{ phone: 2, computer: null, computerCards: 'large' }}
        templateId="bold"
        onSaveProductGrid={onSave}
        productGridOpen={layoutOpen}
        onProductGridOpenChange={setLayoutOpen}
      />
    </MemoryRouter>
  );
};

describe('product layout in Edit store', () => {
  const openLayout = async (user) => {
    await user.click(await screen.findByRole('button', { name: /Product layout/ }));
    return screen.findByRole('button', { name: 'Save layout' });
  };

  it('opens from Edit store, saves, and closes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Editor onSave={onSave} />);
    const save = await openLayout(user);
    expect(screen.getByRole('button', { name: /Template/ })).toHaveTextContent('3 per row');
    await user.click(screen.getByRole('button', { name: /1 per row/ }));
    await user.click(save);
    expect(onSave).toHaveBeenCalledWith({ phone: 1, computer: null, computerCards: 'large' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save layout' })).not.toBeInTheDocument());
  });

  it('is not offered where it cannot be saved', async () => {
    render(<Editor />);
    await screen.findByText('Branding');
    expect(screen.queryByText('Product layout')).not.toBeInTheDocument();
  });
});
