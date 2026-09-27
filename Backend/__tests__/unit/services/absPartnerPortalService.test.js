jest.mock('../../../config/database', () => ({ sequelize: { transaction: jest.fn(fn => fn({ LOCK: { UPDATE: 'UPDATE' } })) } }));
jest.mock('../../../models/AbsPartnerAccount', () => ({ findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn(), count: jest.fn(), create: jest.fn() }));
jest.mock('../../../models/AbsPartnerRecord', () => ({ findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() }));
jest.mock('../../../models', () => ({ SalesAgent: {findByPk: jest.fn(), findAll: jest.fn()}, SalesAgentCode: {findAll: jest.fn()}, SalesAgentCommission: {findAll: jest.fn()}, Tenant: {scope: jest.fn(), count: jest.fn()} }));
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const config = require('../../../config/config');
const Account = require('../../../models/AbsPartnerAccount');
const Record = require('../../../models/AbsPartnerRecord');
const { SalesAgent, SalesAgentCode, SalesAgentCommission, Tenant } = require('../../../models');
const service = require('../../../services/absPartnerPortalService');
const account = () => ({ id:'partner-a', salesAgentId:'agent-a', role:'reseller', email:'partner@example.com', tokenVersion:2, passwordHash:'private', payoutDetails:{ accountNumber:'0240000000' }, update:jest.fn() });
const token = (claims, options = {}) => jwt.sign(claims, config.jwt.secret, {audience:'abs-partner-portal',issuer:'abs',expiresIn:'1h', ...options});
beforeEach(() => { jest.clearAllMocks(); });
it('rejects a normal app token in the partner portal', async () => {
 await expect(service.authenticate(jwt.sign({id:'user-id'},config.jwt.secret))).rejects.toMatchObject({statusCode:401});
 expect(Account.findByPk).not.toHaveBeenCalled();
});
it('rejects revoked sessions and suspended agents', async () => {
 Account.findByPk.mockResolvedValue(account());
 await expect(service.authenticate(token({partnerId:'partner-a',version:1}))).rejects.toMatchObject({statusCode:401});
 SalesAgent.findByPk.mockResolvedValue({status:'disabled'});
 await expect(service.authenticate(token({partnerId:'partner-a',version:2}))).rejects.toMatchObject({statusCode:403});
});
it('authorizes an active partner with the correct token version', async () => {
 const a=account(); Account.findByPk.mockResolvedValue(a); SalesAgent.findByPk.mockResolvedValue({status:'active'});
 expect((await service.authenticate(token({partnerId:a.id,version:2}))).account).toBe(a);
});
it('scopes reseller data and omits private credentials', async () => {
 const a=account(); SalesAgentCode.findAll.mockResolvedValue([]); SalesAgentCommission.findAll.mockResolvedValue([]); Record.findAll.mockResolvedValue([]);
 const findAll=jest.fn().mockResolvedValue([]); Tenant.scope.mockReturnValue({findAll});
 const result=await service.overview(a,{id:a.salesAgentId,name:'Partner',commissionAmount:5000});
 expect(findAll.mock.calls[0][0].where).toEqual({referredByAgentId:'agent-a'});
 expect(SalesAgentCommission.findAll.mock.calls[0][0].where).toEqual({salesAgentId:'agent-a'});
 expect(Record.findAll.mock.calls[0][0].where).toEqual({partnerId:'partner-a'});
 expect(Account.findAll).not.toHaveBeenCalled(); expect(result.account.passwordHash).toBeUndefined();
 expect(findAll.mock.calls[0][0].attributes).not.toContain('metadata');
});
it('limits distributor visibility to assigned resellers', async () => {
 const a={...account(),role:'distributor'}; Account.findAll.mockResolvedValue([]); SalesAgentCode.findAll.mockResolvedValue([]); SalesAgentCommission.findAll.mockResolvedValue([]); Record.findAll.mockResolvedValue([]); Tenant.scope.mockReturnValue({findAll:jest.fn().mockResolvedValue([])});
 await service.overview(a,{id:a.salesAgentId}); expect(Account.findAll.mock.calls[0][0].where).toEqual({distributorId:a.id});
});
it('does not permit editing another partner record', async () => {
 Record.findOne.mockResolvedValue(null);
 await expect(service.updateRecord(account(),'other-record',{status:'won'})).rejects.toMatchObject({statusCode:404});
 expect(Record.findOne.mock.calls[0][0].where).toEqual({id:'other-record',partnerId:'partner-a'});
});
it('ignores client-supplied owner and earnings when creating a lead', async () => {
 Record.create.mockImplementation(async row => row);
 const result=await service.createRecord(account(),{kind:'lead',title:'Shop',partnerId:'other',amount:50000,status:'paid'});
 expect(result.partnerId).toBe('partner-a'); expect(result.status).toBe('new'); expect(result.details.amount).toBeUndefined();
});
it('rejects partner attempts to mark a payout paid', async () => {
 Record.findOne.mockResolvedValue({kind:'payout',status:'pending'});
 await expect(service.updateRecord(account(),'payout',{status:'paid'})).rejects.toMatchObject({statusCode:403});
});
it('prevents duplicate pending payout requests', async () => {
 Account.findByPk.mockResolvedValue(account()); Record.findOne.mockResolvedValue({status:'pending'});
 await expect(service.createRecord(account(),{kind:'payout'})).rejects.toThrow('pending payout');
 expect(Record.create).not.toHaveBeenCalled();
});
it('derives payout amount from due commissions instead of client input', async () => {
 Account.findByPk.mockResolvedValue(account()); Record.findOne.mockResolvedValue(null);
 SalesAgentCommission.findAll.mockResolvedValue([{id:'c1',amount:5000,currency:'GHS'}]); Record.create.mockImplementation(async row=>row);
 const result=await service.createRecord(account(),{kind:'payout',amount:999999});
 expect(result.details.amount).toBe(5000); expect(result.details.commissionIds).toEqual(['c1']);
});
it('rejects payout settlement if commissions were already paid elsewhere', async () => {
 Record.findOne.mockResolvedValue({kind:'payout',status:'pending',partnerId:'partner-a',details:{commissionIds:['c1']}}); Account.findByPk.mockResolvedValue(account()); SalesAgentCommission.findAll.mockResolvedValue([{id:'c1',status:'paid'}]);
 await expect(service.updateRecord(null,'r1',{status:'paid',note:'REF123'},'admin')).rejects.toThrow('balances changed');
});
it('settles only the payout owner’s commissions and records the payment reference', async () => {
 const update=jest.fn(); const record={kind:'payout',status:'pending',partnerId:'partner-a',details:{commissionIds:['c1']},history:[],update}; Record.findOne.mockResolvedValue(record); Account.findByPk.mockResolvedValue(account()); const c={id:'c1',status:'due',update:jest.fn()}; SalesAgentCommission.findAll.mockResolvedValue([c]);
 await service.updateRecord(null,'r1',{status:'paid',note:'REF123'},'admin');
 expect(SalesAgentCommission.findAll.mock.calls[0][0].where.salesAgentId).toBe('agent-a');
 expect(c.update.mock.calls[0][0]).toMatchObject({status:'paid',paidBy:'admin'});
 expect(update.mock.calls[0][0].history[0]).toMatchObject({actor:'ABS',note:'REF123'});
});
it('requires an active agent and valid distributor to issue invitations', async () => {
 SalesAgent.findByPk.mockResolvedValue({status:'disabled'});
 await expect(service.invite('a',{},'admin')).rejects.toThrow('Approve');
 SalesAgent.findByPk.mockResolvedValue({id:'a',status:'active',email:'a@example.com'}); Account.findByPk.mockResolvedValue({role:'reseller'});
 await expect(service.invite('a',{distributorId:'not-distributor'},'admin')).rejects.toThrow('active distributor');
});
it('stores only an invitation hash and invalidates earlier sessions', async () => {
 SalesAgent.findByPk.mockResolvedValue({id:'agent-a',status:'active',email:'a@example.com'}); const a=account(); Account.findOne.mockResolvedValue(a); Account.count.mockResolvedValue(0); Record.create.mockResolvedValue({});
 const result=await service.invite('agent-a',{role:'reseller'},'admin');
 expect(result.token).toMatch(/^[a-f0-9]{64}$/);
 expect(a.update.mock.calls[0][0]).toMatchObject({passwordHash:null,tokenVersion:3});
 expect(a.update.mock.calls[0][0].inviteHash).not.toBe(result.token);
 expect(result.account.passwordHash).toBeUndefined();
});
it('rejects malformed invitations before hashing a password', async () => {
 await expect(service.accept({token:'bad',password:'password'})).rejects.toMatchObject({statusCode:400});
 expect(Account.findOne).not.toHaveBeenCalled();
});
it('consumes an invitation once and clears its stored hash', async () => {
 const a=account(); Account.findOne.mockResolvedValueOnce(a).mockResolvedValueOnce(null); SalesAgent.findByPk.mockResolvedValue({status:'active'});
 const input={token:'a'.repeat(64),password:'a-secure-long-password'};
 const result=await service.accept(input);
 expect(a.update.mock.calls[0][0]).toMatchObject({inviteHash:null,inviteExpiresAt:null});
 expect(a.update.mock.calls[0][0].passwordHash).not.toBe(input.password);
 expect(jwt.verify(result.token,config.jwt.secret,{audience:'abs-partner-portal'}).partnerId).toBe(a.id);
 await expect(service.accept(input)).rejects.toThrow('expired or has already been used');
 const condition=Account.findOne.mock.calls[0][0].where;
 expect(condition.inviteExpiresAt[Op.gt]).toBeInstanceOf(Date);
});
