/**
 * Permanently delete a tenant and all scoped business data.
 * Used by platform admin API and maintenance scripts.
 */

const {
  Tenant,
  User,
  UserTenant,
  JobStatusHistory,
  JobItem,
  Payment,
  Expense,
  ExpenseActivity,
  Invoice,
  LeadActivity,
  Job,
  QuoteItem,
  Quote,
  QuoteActivity,
  Lead,
  SaleItem,
  Sale,
  SaleActivity,
  SaleReturn,
  SaleReturnItem,
  SaleReturnExchangeItem,
  ProductVariant,
  ProductStockMovement,
  ProductShopStock,
  Barcode,
  Product,
  ProductCategory,
  Shop,
  StockTransfer,
  PrescriptionItem,
  DrugInteraction,
  ExpiryAlert,
  Prescription,
  Drug,
  Pharmacy,
  EmployeeDocument,
  EmploymentHistory,
  PayrollEntry,
  PayrollRun,
  Employee,
  JournalEntryLine,
  JournalEntry,
  AccountBalance,
  Account,
  InventoryMovement,
  InventoryItem,
  InventoryCategory,
  MaterialMovement,
  MaterialItem,
  MaterialCategory,
  Equipment,
  EquipmentCategory,
  CustomerActivity,
  Customer,
  CustomerFeedback,
  Vendor,
  Setting,
  PricingTemplate,
  VendorPriceList,
  CustomDropdownOption,
  InviteToken,
  Notification,
  SabitoTenantMapping,
  StockCount,
  StockCountItem,
  FootTraffic,
  SubscriptionPayment,
  SupportTicket,
  SupportAccessSession,
  DeliveryEvent,
  SystemHealthIssue,
  AutomationDelayedRun,
  MarketplaceOrderPayment,
  MarketplaceLedgerEntry,
  MarketplacePayout,
  MarketplaceDispute,
  StorefrontWishlistItem,
  StorefrontReview,
  OnlineProductListing,
  OnlineServiceListing,
  OnlineStoreSettings,
  Dealer,
  DealerLedgerEntry,
  DealerPriceTier,
  DealerProductPrice,
  SalesAgentCommission,
  PartnerProgramSettings,
  PartnerProgramService,
  PartnershipApplication,
  Partnership,
  PartnerCommission,
  PartnerReferral,
  PartnerCashoutRequest,
  PlatformAdminUserRole,
  UserTodo,
  UserWeekFocus,
  UserTask,
  UserChecklist,
  UserChecklistItem,
  TenantAccessAudit,
  AutomationRun,
  AutomationRule,
  WhatsAppMessageEvent,
  MarketingCampaign,
  RecurringJournal,
  RecurringJournalRun,
  StudioLocation,
  UserStudioLocation,
  UserShop,
  EmailVerificationToken,
  PasswordResetToken,
} = require('../models');

const PLATFORM_TENANT_SLUG = 'platform';

/**
 * Destroy rows matching `where`. Always scoped by the caller — pass tenantId (or child ids
 * already loaded for this tenant) so other tenants cannot be touched.
 * Sequelize associations do not set onDelete CASCADE; some migrations do at the DB layer.
 * Missing tables/columns are skipped unless strict mode is on.
 *
 * @param {import('sequelize').Model} Model
 * @param {object} where
 * @param {object} [opts]
 * @returns {Promise<number>}
 */
async function del(Model, where, opts = {}) {
  if (!Model?.destroy) return 0;
  const { strict, ...destroyOpts } = opts;
  try {
    return await Model.destroy({ where, ...destroyOpts });
  } catch (err) {
    if (strict || process.env.DELETE_TENANT_DATA_STRICT === 'true') {
      throw err;
    }
    console.warn(`[deleteTenantData] ${Model.name}: ${err.message}`);
    return 0;
  }
}

/**
 * Hard-delete every tenant-scoped row that would block removing the tenant, then the tenant.
 * Children are deleted first (sale returns before sales, listings before products, memberships last).
 *
 * @param {string} tenantId
 * @param {import('sequelize').Transaction} [transaction]
 */
async function deleteTenantData(tenantId, transaction = null) {
  const options = transaction ? { transaction } : {};
  const id = tenantId;

  const jobIds = (
    await Job.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const quoteIds = (
    await Quote.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const leadIds = (
    await Lead.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const saleIds = (
    await Sale.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const productIds = (
    await Product.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const shopIds = (
    await Shop.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const prescriptionIds = (
    await Prescription.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const drugIds = (
    await Drug.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const employeeIds = (
    await Employee.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const payrollRunIds = (
    await PayrollRun.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const journalEntryIds = (
    await JournalEntry.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const stockCountIds = (
    await StockCount.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const recurringJournalIds = (
    await RecurringJournal.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const checklistIds = (
    await UserChecklist.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  const studioLocationIds = (
    await StudioLocation.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
  ).map((r) => r.id);
  let saleReturnIds = [];
  try {
    saleReturnIds = (
      await SaleReturn.findAll({ where: { tenantId: id }, attributes: ['id'], ...options })
    ).map((r) => r.id);
  } catch (err) {
    console.warn(`[deleteTenantData] SaleReturn.findAll: ${err.message}`);
  }

  await del(AutomationDelayedRun, { tenantId: id }, options);
  await del(AutomationRun, { tenantId: id }, options);
  await del(AutomationRule, { tenantId: id }, options);
  await del(WhatsAppMessageEvent, { tenantId: id }, options);
  await del(MarketingCampaign, { tenantId: id }, options);
  if (recurringJournalIds.length) {
    await del(RecurringJournalRun, { recurringJournalId: recurringJournalIds }, options);
  }
  await del(RecurringJournalRun, { tenantId: id }, options);
  await del(RecurringJournal, { tenantId: id }, options);

  if (jobIds.length) await del(JobStatusHistory, { jobId: jobIds }, options);
  if (jobIds.length) await del(JobItem, { jobId: jobIds }, options);
  if (jobIds.length) await del(MaterialMovement, { jobId: jobIds }, options);

  await del(ExpenseActivity, { tenantId: id }, options);
  await del(Payment, { tenantId: id }, options);
  await del(Expense, { tenantId: id }, options);
  await del(PartnerCommission, { tenantId: id }, options);
  await del(PartnerCashoutRequest, { tenantId: id }, options);
  await del(PartnerReferral, { tenantId: id }, options);
  await Sale.update({ invoiceId: null }, { where: { tenantId: id }, ...options });
  await Prescription.update({ invoiceId: null }, { where: { tenantId: id }, ...options });
  await del(Invoice, { tenantId: id }, options);
  if (leadIds.length) await del(LeadActivity, { leadId: leadIds }, options);
  await Lead.update({ convertedJobId: null }, { where: { tenantId: id }, ...options });
  await Job.update({ adminLeadId: null }, { where: { tenantId: id }, ...options });
  await del(Job, { tenantId: id }, options);
  if (quoteIds.length) await del(QuoteItem, { quoteId: quoteIds }, options);
  await del(QuoteActivity, { tenantId: id }, options);
  await del(Quote, { tenantId: id }, options);
  await del(Lead, { tenantId: id }, options);
  await del(MarketplaceDispute, { tenantId: id }, options);
  await del(MarketplaceLedgerEntry, { tenantId: id }, options);
  await del(MarketplacePayout, { tenantId: id }, options);
  await del(MarketplaceOrderPayment, { tenantId: id }, options);
  await del(DeliveryEvent, { tenantId: id }, options);
  await del(DealerLedgerEntry, { tenantId: id }, options);
  if (saleReturnIds.length) {
    await del(SaleReturnItem, { saleReturnId: saleReturnIds }, options);
    await del(SaleReturnExchangeItem, { saleReturnId: saleReturnIds }, options);
  }
  await del(SaleReturn, { tenantId: id }, options);
  if (saleIds.length) await del(SaleItem, { saleId: saleIds }, options);
  await del(SaleActivity, { tenantId: id }, options);
  await del(Sale, { tenantId: id }, { ...options, force: true });
  await del(DealerProductPrice, { tenantId: id }, options);
  await del(DealerPriceTier, { tenantId: id }, options);
  await del(Dealer, { tenantId: id }, options);
  if (stockCountIds.length) await del(StockCountItem, { stockCountId: stockCountIds }, options);
  await del(StockTransfer, { tenantId: id }, options);
  await del(ProductStockMovement, { tenantId: id }, options);
  await del(ProductShopStock, { tenantId: id }, options);
  await del(StorefrontWishlistItem, { tenantId: id }, options);
  await del(StorefrontReview, { tenantId: id }, options);
  await del(PartnerProgramService, { tenantId: id }, options);
  await del(OnlineProductListing, { tenantId: id }, options);
  await del(OnlineServiceListing, { tenantId: id }, options);
  await del(OnlineStoreSettings, { tenantId: id }, options);
  await del(Barcode, { tenantId: id }, options);
  if (productIds.length) await del(ProductVariant, { productId: productIds }, options);
  await del(Product, { tenantId: id }, options);
  await del(ProductCategory, { tenantId: id }, options);
  if (shopIds.length) {
    await del(UserShop, { shopId: shopIds }, options);
  }
  await del(UserShop, { tenantId: id }, options);
  if (prescriptionIds.length) await del(PrescriptionItem, { prescriptionId: prescriptionIds }, options);
  await del(DrugInteraction, { tenantId: id }, options);
  if (drugIds.length) await del(ExpiryAlert, { drugId: drugIds }, options);
  await del(Prescription, { tenantId: id }, options);
  await del(Drug, { tenantId: id }, options);
  await del(Pharmacy, { tenantId: id }, options);
  if (employeeIds.length) await del(EmployeeDocument, { employeeId: employeeIds }, options);
  if (employeeIds.length) await del(EmploymentHistory, { employeeId: employeeIds }, options);
  if (payrollRunIds.length) await del(PayrollEntry, { payrollRunId: payrollRunIds }, options);
  await del(PayrollRun, { tenantId: id }, options);
  await del(Employee, { tenantId: id }, options);
  if (journalEntryIds.length) await del(JournalEntryLine, { journalEntryId: journalEntryIds }, options);
  await del(JournalEntry, { tenantId: id }, options);
  await del(AccountBalance, { tenantId: id }, options);
  await Account.update({ parentId: null }, { where: { tenantId: id }, ...options });
  await del(Account, { tenantId: id }, options);
  await del(MaterialMovement, { tenantId: id }, options);
  await del(MaterialItem, { tenantId: id }, options);
  await del(MaterialCategory, { tenantId: id }, options);
  await del(InventoryMovement, { tenantId: id }, options);
  await del(InventoryItem, { tenantId: id }, options);
  await del(InventoryCategory, { tenantId: id }, options);
  await del(Equipment, { tenantId: id }, options);
  await del(EquipmentCategory, { tenantId: id }, options);
  await del(CustomerActivity, { tenantId: id }, options);
  await del(CustomerFeedback, { tenantId: id }, options);
  await del(Customer, { tenantId: id }, options);
  await del(VendorPriceList, { tenantId: id }, options);
  await del(Vendor, { tenantId: id }, options);
  await del(Setting, { tenantId: id }, options);
  await del(PricingTemplate, { tenantId: id }, options);
  await del(CustomDropdownOption, { tenantId: id }, options);
  await del(InviteToken, { tenantId: id }, options);
  await del(Notification, { tenantId: id }, options);
  await del(SabitoTenantMapping, { nexproTenantId: id }, options);
  await del(Partnership, { tenantId: id }, options);
  await del(PartnershipApplication, { tenantId: id }, options);
  await del(PartnerProgramSettings, { tenantId: id }, options);
  await del(SalesAgentCommission, { tenantId: id }, options);
  await del(SubscriptionPayment, { tenantId: id }, options);
  await del(SupportTicket, { tenantId: id }, options);
  await del(SupportAccessSession, { tenantId: id }, options);
  await del(SystemHealthIssue, { tenantId: id }, options);
  await del(StockCount, { tenantId: id }, options);
  await del(FootTraffic, { tenantId: id }, options);
  await del(Shop, { tenantId: id }, options);
  await del(UserTask, { tenantId: id }, options);
  if (checklistIds.length) await del(UserChecklistItem, { checklistId: checklistIds }, options);
  await del(UserChecklist, { tenantId: id }, options);
  await del(TenantAccessAudit, { tenantId: id }, options);
  if (studioLocationIds.length) {
    await del(UserStudioLocation, { studioLocationId: studioLocationIds }, options);
  }
  await del(UserStudioLocation, { tenantId: id }, options);
  await del(StudioLocation, { tenantId: id }, options);
  await del(UserTenant, { tenantId: id }, options);
  await del(Tenant, { id }, options);
}

/**
 * Remove non–platform-admin users with no remaining workspace memberships.
 * @param {import('sequelize').Transaction} [transaction]
 */
async function deleteOrphanUsersWithoutTenants(transaction = null) {
  const options = transaction ? { transaction } : {};
  const users = await User.findAll({
    attributes: ['id', 'isPlatformAdmin'],
    ...options,
  });

  for (const user of users) {
    if (user.isPlatformAdmin) continue;
    const membershipCount = await UserTenant.count({
      where: { userId: user.id },
      ...options,
    });
    if (membershipCount > 0) continue;

    await del(EmailVerificationToken, { userId: user.id }, options);
    await del(PasswordResetToken, { userId: user.id }, options);
    await del(PlatformAdminUserRole, { userId: user.id }, options);
    await del(Notification, { userId: user.id }, options);
    await del(UserTodo, { userId: user.id }, options);
    await del(UserWeekFocus, { userId: user.id }, options);
    await del(User, { id: user.id }, options);
  }
}

module.exports = {
  PLATFORM_TENANT_SLUG,
  deleteTenantData,
  deleteOrphanUsersWithoutTenants,
};
