jest.mock('../../../models', () => ({ SalesAgent: {findByPk:jest.fn(),create:jest.fn()}, SalesAgentCode:{}, SalesAgentCommission:{findOne:jest.fn(),count:jest.fn(),create:jest.fn()},Tenant:{scope:jest.fn()},SubscriptionPayment:{},Setting:{} }));
const {SalesAgent,SalesAgentCommission,Tenant}=require('../../../models');
const {maybeCreateCommissionForSuccessfulPayment,createSalesAgent,updateSalesAgent}=require('../../../services/salesAgentService');
const {validateCommissionPercent,calculatePercentageCommission}=require('../../../utils/salesAgentCommissionRate');
beforeEach(()=>{
 jest.clearAllMocks();
 Tenant.scope.mockReturnValue({findByPk:jest.fn().mockResolvedValue({id:'tenant',referredByAgentId:'agent'})});
 SalesAgent.findByPk.mockResolvedValue({id:'agent',status:'active',commissionAmount:5000,metadata:{commissionPercent:10}});
 SalesAgentCommission.findOne.mockResolvedValue(null);SalesAgentCommission.count.mockResolvedValue(0);SalesAgentCommission.create.mockImplementation(async row=>row);
});
it.each([[20000,10,2000],[9900,12.5,1238],[100,0,0],[20000,100,20000],[1,10,0]])('calculates %i minor units at %s percent as %i', (amount,rate,expected)=>{
 expect(calculatePercentageCommission(amount,rate)).toBe(expected);
});
it.each([-1,101,'',null,true,'abc',2.555])('rejects invalid percentage %s',rate=>expect(()=>validateCommissionPercent(rate)).toThrow());
it('uses the actual annual or monthly payment and snapshots the percentage',async()=>{
 const result=await maybeCreateCommissionForSuccessfulPayment({id:'payment',tenantId:'tenant',amount:20000,status:'success',currency:'GHS',billingPeriod:'yearly'});
 expect(result.commission.amount).toBe(2000);expect(result.commission.metadata).toMatchObject({commissionType:'percentage',commissionPercent:10,paymentAmount:20000,billingPeriod:'yearly'});
});
it('does not fall back to the old fixed amount for a zero percent agreement',async()=>{
 SalesAgent.findByPk.mockResolvedValue({id:'agent',status:'active',commissionAmount:5000,metadata:{commissionPercent:0}});
 const result=await maybeCreateCommissionForSuccessfulPayment({amount:20000,status:'success'});
 expect(result.skippedReason).toBe('zero_commission');expect(SalesAgentCommission.create).not.toHaveBeenCalled();
});
it('retains the cap and prevents duplicate payment commissions',async()=>{
 SalesAgentCommission.findOne.mockResolvedValue({id:'existing'});
 expect((await maybeCreateCommissionForSuccessfulPayment({id:'payment',amount:20000,status:'success'})).skippedReason).toBe('already_recorded');
 SalesAgentCommission.findOne.mockResolvedValue(null);SalesAgentCommission.count.mockResolvedValue(3);
 expect((await maybeCreateCommissionForSuccessfulPayment({id:'payment',amount:20000,status:'success'})).skippedReason).toBe('cap_reached');
});
it('requires a percentage when creating an active agent',async()=>{
 await expect(createSalesAgent({name:'Ama',status:'active'})).rejects.toMatchObject({statusCode:400});
 expect(SalesAgent.create).not.toHaveBeenCalled();
});
it('saves a new percentage without losing other partner metadata',async()=>{
 const update=jest.fn();SalesAgent.findByPk.mockResolvedValue({id:'agent',metadata:{source:'application'},update});
 await updateSalesAgent('agent',{commissionPercent:'12.5'});
 expect(update).toHaveBeenCalledWith({metadata:{source:'application',commissionPercent:12.5}});
});
