import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach, it, expect } from 'vitest';
import PartnerPortalDesk from '../../components/admin/PartnerPortalDesk';
import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
const agents=[{id:'agent-a',name:'Ama',email:'ama@example.com',status:'active'}];
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{accounts:[],records:[]}});});
it('does not fetch payout details without billing permission', async()=>{
 render(<PartnerPortalDesk agents={agents} canInvite canManageBilling={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Open partner desk'}));
 await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/admin/partner-portal'));
 expect(api.get).not.toHaveBeenCalledWith('/admin/partner-portal/payouts');
});
it('generates an invitation link without sending mail',async()=>{
 api.post.mockResolvedValue({data:{token:'one-time-token'}});
 render(<PartnerPortalDesk agents={agents} canInvite canManageBilling={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Open partner desk'}));
 fireEvent.change(screen.getByLabelText('Active agent (current list)'),{target:{value:'agent-a'}});
 fireEvent.click(screen.getByRole('button',{name:'Generate invitation / reset access'}));
 const link=await screen.findByLabelText(/Invitation link/);
 expect(link.value).toContain('/partners#invite=one-time-token');
 expect(api.post).toHaveBeenCalledWith('/admin/sales-agents/agent-a/portal-invitation',{role:'reseller',distributorId:null});
});
it('routes a support reply through the support-only endpoint',async()=>{
 api.get.mockResolvedValue({data:{accounts:[],records:[{id:'support-a',kind:'support',title:'Help',status:'open',details:{message:'Please help'},history:[]}]}});
 render(<PartnerPortalDesk agents={agents} canInvite canManageBilling={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Open partner desk'}));
 fireEvent.change(await screen.findByRole('textbox',{name:'Reply or payment reference'}),{target:{value:'We can help'}});
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('/admin/partner-portal/support/support-a',{status:'open',note:'We can help'}));
});
