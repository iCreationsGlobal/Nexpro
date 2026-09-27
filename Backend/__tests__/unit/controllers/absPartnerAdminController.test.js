jest.mock('../../../models/AbsPartnerAccount', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/AbsPartnerRecord', () => ({ findAll: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../models', () => ({ SalesAgent: { findAll: jest.fn() } }));
jest.mock('../../../services/absPartnerPortalService', () => ({ invite: jest.fn(), updateRecord: jest.fn() }));
const Account = require('../../../models/AbsPartnerAccount');
const Record = require('../../../models/AbsPartnerRecord');
const { SalesAgent } = require('../../../models');
const service = require('../../../services/absPartnerPortalService');
const controller = require('../../../controllers/absPartnerAdminController');
const response = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });
beforeEach(() => jest.clearAllMocks());
it('keeps payout destinations and account secrets out of the general partner desk', async () => {
 Account.findAll.mockResolvedValue([]); SalesAgent.findAll.mockResolvedValue([]); Record.findAll.mockResolvedValue([]);
 const res=response(); await controller.list({},res,jest.fn());
 expect(Record.findAll.mock.calls[0][0].where).toEqual({kind:'support'});
 const fields=Account.findAll.mock.calls[0][0].attributes;
 for(const secret of ['passwordHash','inviteHash','payoutDetails']) expect(fields).not.toContain(secret);
 expect(res.json).toHaveBeenCalledWith({success:true,data:{accounts:[],records:[]}});
});
it('does not allow the support endpoint to settle a payout', async () => {
 Record.findOne.mockResolvedValue(null); const res=response();
 await controller.updateSupport({params:{id:'payout-id'},body:{status:'paid'},user:{id:'admin'}},res,jest.fn());
 expect(Record.findOne).toHaveBeenCalledWith({where:{id:'payout-id',kind:'support'}});
 expect(res.status).toHaveBeenCalledWith(404); expect(service.updateRecord).not.toHaveBeenCalled();
});
it('records an authorized support reply using the authenticated administrator', async () => {
 Record.findOne.mockResolvedValue({id:'support-id'}); service.updateRecord.mockResolvedValue({id:'support-id'}); const res=response();
 await controller.updateSupport({params:{id:'support-id'},body:{note:'Resolved'},user:{id:'admin'}},res,jest.fn());
 expect(service.updateRecord).toHaveBeenCalledWith(null,'support-id',{note:'Resolved'},'admin');
});
it('uses the authenticated administrator when issuing invitations', async () => {
 service.invite.mockResolvedValue({token:'one-time-secret'}); const res=response();
 await controller.invite({params:{id:'agent'},body:{role:'reseller',actorId:'forged'},user:{id:'real-admin'}},res,jest.fn());
 expect(service.invite).toHaveBeenCalledWith('agent',expect.any(Object),'real-admin');
});
