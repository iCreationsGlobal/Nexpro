import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach, it, expect } from 'vitest';
import PartnerPortal from '../../pages/PartnerPortal';
import service, { partnerSession } from '../../services/absPartnerPortalService';
vi.mock('../../services/absPartnerPortalService', () => ({default:{overview:vi.fn(),login:vi.fn(),accept:vi.fn(),create:vi.fn(),update:vi.fn(),logout:vi.fn()},partnerSession:{get:vi.fn(),set:vi.fn(),clear:vi.fn()}}));
const overview = {name:'Ama',account:{role:'reseller'},businesses:[],commissions:[],records:[],team:[],codes:[{id:'c',code:'AMA-01'}],payoutDetails:{},commissionAmount:5000};
beforeEach(() => {vi.clearAllMocks();window.history.replaceState(null,'','/partners'); service.overview.mockResolvedValue(overview);});
it('signs into a separate partner workspace and creates a referral signup link', async () => {
 partnerSession.get.mockReturnValue(null); service.login.mockResolvedValue({token:'partner-token'});
 render(<PartnerPortal />); fireEvent.change(screen.getByLabelText('Email'),{target:{value:'ama@example.com'}}); fireEvent.change(screen.getByLabelText('Password'),{target:{value:'long-password'}}); fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
 expect(await screen.findByText('Your referral links')).toBeInTheDocument(); expect(partnerSession.set).toHaveBeenCalledWith('partner-token');
 expect(screen.getByLabelText('Referral link AMA-01').value).toContain('/signup?code=AMA-01');
 expect(screen.queryByRole('button',{name:'Resellers'})).not.toBeInTheDocument();
});
it('accepts an invitation from the fragment and removes the secret from the address', async () => {
 window.history.replaceState(null,'','/partners#invite=secret'); service.accept.mockResolvedValue({token:'accepted'});
 render(<PartnerPortal />); fireEvent.change(screen.getByLabelText('Password'),{target:{value:'long-password'}}); fireEvent.click(screen.getByRole('button',{name:'Accept invitation'}));
 await screen.findByText('Your referral links'); expect(service.accept).toHaveBeenCalledWith({token:'secret',password:'long-password'}); expect(window.location.hash).toBe('');
});
it('renders assigned resellers only for a distributor', async () => {
 partnerSession.get.mockReturnValue('session'); service.overview.mockResolvedValue({...overview,account:{role:'distributor'},team:[{id:'r',name:'Assigned reseller',email:'r@example.com',status:'active',businessCount:3}]});
 render(<PartnerPortal />); fireEvent.click(await screen.findByRole('button',{name:'Resellers'})); expect(screen.getByText('Assigned reseller')).toBeInTheDocument();
});
it('clears a suspended partner session when the server denies access', async () => {
 partnerSession.get.mockReturnValue('session');service.overview.mockRejectedValue({response:{status:403,data:{message:'Partner access is inactive.'}}});
 render(<PartnerPortal />); await waitFor(()=>expect(partnerSession.clear).toHaveBeenCalled());expect(await screen.findByRole('button',{name:'Sign in'})).toBeInTheDocument();
});
it('returns to ordinary login after accepting an invite and signing out', async () => {
 window.history.replaceState(null,'','/partners#invite=once'); service.accept.mockResolvedValue({token:'accepted'}); service.logout.mockResolvedValue({});
 render(<PartnerPortal />); fireEvent.change(screen.getByLabelText('Password'),{target:{value:'long-password'}}); fireEvent.click(screen.getByRole('button',{name:'Accept invitation'}));
 fireEvent.click(await screen.findByRole('button',{name:'Sign out'}));
 expect(await screen.findByRole('button',{name:'Sign in'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Accept invitation'})).not.toBeInTheDocument();
});
