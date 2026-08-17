const User = require('./User');
const Tenant = require('./Tenant');
const UserTenant = require('./UserTenant');
const Customer = require('./Customer');
const Vendor = require('./Vendor');
const Job = require('./Job');
const Payment = require('./Payment');
const Expense = require('./Expense');
const PricingTemplate = require('./PricingTemplate');
const VendorPriceList = require('./VendorPriceList');
const JobItem = require('./JobItem');
const Quote = require('./Quote');
const QuoteItem = require('./QuoteItem');
const JobStatusHistory = require('./JobStatusHistory');
const Invoice = require('./Invoice');
const InviteToken = require('./InviteToken');
const PasswordResetToken = require('./PasswordResetToken');
const EmailVerificationToken = require('./EmailVerificationToken');
const Notification = require('./Notification');
const MaterialCategory = require('./MaterialCategory');
const MaterialItem = require('./MaterialItem');
const MaterialMovement = require('./MaterialMovement');
const EquipmentCategory = require('./EquipmentCategory');
const Equipment = require('./Equipment');
const Lead = require('./Lead');
const LeadActivity = require('./LeadActivity');
const CustomerActivity = require('./CustomerActivity');
const CustomerFeedback = require('./CustomerFeedback');
const QuoteActivity = require('./QuoteActivity');
const SaleActivity = require('./SaleActivity');
const ExpenseActivity = require('./ExpenseActivity');
const Setting = require('./Setting');
const Employee = require('./Employee');
const EmployeeDocument = require('./EmployeeDocument');
const EmploymentHistory = require('./EmploymentHistory');
const PayrollRun = require('./PayrollRun');
const PayrollEntry = require('./PayrollEntry');
const Account = require('./Account');
const JournalEntry = require('./JournalEntry');
const JournalEntryLine = require('./JournalEntryLine');
const AccountBalance = require('./AccountBalance');
const RecurringJournal = require('./RecurringJournal');
const RecurringJournalRun = require('./RecurringJournalRun');
const SubscriptionPlan = require('./SubscriptionPlan');
const SubscriptionPayment = require('./SubscriptionPayment');
const CustomDropdownOption = require('./CustomDropdownOption');
const SabitoTenantMapping = require('./SabitoTenantMapping');
// Shop Management Models
const Shop = require('./Shop');
const Product = require('./Product');
const Sale = require('./Sale');
const SaleItem = require('./SaleItem');
const SaleReturn = require('./SaleReturn');
const SaleReturnItem = require('./SaleReturnItem');
const SaleReturnExchangeItem = require('./SaleReturnExchangeItem');
const ProductVariant = require('./ProductVariant');
const ProductStockMovement = require('./ProductStockMovement');
const ProductShopStock = require('./ProductShopStock');
const Barcode = require('./Barcode');
const ProductCategory = require('./ProductCategory');
// Pharmacy Management Models
const Pharmacy = require('./Pharmacy');
const Drug = require('./Drug');
const Prescription = require('./Prescription');
const PrescriptionItem = require('./PrescriptionItem');
const DrugInteraction = require('./DrugInteraction');
const ExpiryAlert = require('./ExpiryAlert');
// Retail Intelligence Models
const FootTraffic = require('./FootTraffic');
const StockCount = require('./StockCount');
const StockCountItem = require('./StockCountItem');
const StockTransfer = require('./StockTransfer');
// Platform Admin Roles
const PlatformAdminRole = require('./PlatformAdminRole');
const PlatformAdminPermission = require('./PlatformAdminPermission');
const PlatformAdminRolePermission = require('./PlatformAdminRolePermission');
const PlatformAdminUserRole = require('./PlatformAdminUserRole');
const UserTodo = require('./UserTodo');
const UserWeekFocus = require('./UserWeekFocus');
const UserTask = require('./UserTask');
const UserChecklist = require('./UserChecklist');
const UserChecklistItem = require('./UserChecklistItem');
const TenantAccessAudit = require('./TenantAccessAudit');
const SupportTicket = require('./SupportTicket');
const SupportAccessSession = require('./SupportAccessSession');
const AutomationRule = require('./AutomationRule');
const AutomationRun = require('./AutomationRun');
const AutomationDelayedRun = require('./AutomationDelayedRun');
const WhatsAppMessageEvent = require('./WhatsAppMessageEvent');
const MarketingCampaign = require('./MarketingCampaign');
const StudioLocation = require('./StudioLocation');
const UserStudioLocation = require('./UserStudioLocation');
const UserShop = require('./UserShop');
const OnlineStoreSettings = require('./OnlineStoreSettings');
const OnlineStoreHeroCategory = require('./OnlineStoreHeroCategory');
const OnlineStoreHeroDesign = require('./OnlineStoreHeroDesign');
const OnlineStoreHeroColorway = require('./OnlineStoreHeroColorway');
const OnlineProductListing = require('./OnlineProductListing');
const OnlineServiceListing = require('./OnlineServiceListing');
const StorefrontCustomer = require('./StorefrontCustomer');
const StorefrontWishlistItem = require('./StorefrontWishlistItem');
const StorefrontReview = require('./StorefrontReview');
const MarketplaceOrderPayment = require('./MarketplaceOrderPayment');
const MarketplaceLedgerEntry = require('./MarketplaceLedgerEntry');
const MarketplacePayout = require('./MarketplacePayout');
const MarketplaceDispute = require('./MarketplaceDispute');
const Dealer = require('./Dealer');
const DealerLedgerEntry = require('./DealerLedgerEntry');
const DealerPriceTier = require('./DealerPriceTier');
const DealerProductPrice = require('./DealerProductPrice');
const SalesAgent = require('./SalesAgent');
const SalesAgentCode = require('./SalesAgentCode');
const SalesAgentCommission = require('./SalesAgentCommission');
const PartnerProgramSettings = require('./PartnerProgramSettings');
const PartnerProgramService = require('./PartnerProgramService');
const Marketer = require('./Marketer');
const PartnershipApplication = require('./PartnershipApplication');
const Partnership = require('./Partnership');
const PartnerCommission = require('./PartnerCommission');
const PartnerReferral = require('./PartnerReferral');
const PartnerCashoutRequest = require('./PartnerCashoutRequest');
const DeliveryEvent = require('./DeliveryEvent');
const SystemHealthIssue = require('./SystemHealthIssue');
const PlatformOpsAsset = require('./PlatformOpsAsset');
const PlatformOpsSecretReveal = require('./PlatformOpsSecretReveal');
const PlatformOpsRevealChallenge = require('./PlatformOpsRevealChallenge');

// Define relationships
Tenant.hasMany(DeliveryEvent, { foreignKey: 'tenantId', as: 'deliveryEvents' });
DeliveryEvent.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Tenant.hasMany(SystemHealthIssue, { foreignKey: 'tenantId', as: 'systemHealthIssues' });
SystemHealthIssue.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

User.hasMany(PlatformOpsAsset, { foreignKey: 'createdBy', as: 'opsAssetsCreated' });
PlatformOpsAsset.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
PlatformOpsAsset.belongsTo(User, { foreignKey: 'updatedBy', as: 'updater' });
PlatformOpsAsset.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Customer.hasMany(PlatformOpsAsset, { foreignKey: 'customerId', as: 'opsAssets' });
PlatformOpsAsset.hasMany(PlatformOpsSecretReveal, { foreignKey: 'assetId', as: 'reveals' });
PlatformOpsSecretReveal.belongsTo(PlatformOpsAsset, { foreignKey: 'assetId', as: 'asset' });
PlatformOpsSecretReveal.belongsTo(User, { foreignKey: 'requestedBy', as: 'requester' });
PlatformOpsAsset.hasMany(PlatformOpsRevealChallenge, { foreignKey: 'assetId', as: 'revealChallenges' });
PlatformOpsRevealChallenge.belongsTo(PlatformOpsAsset, { foreignKey: 'assetId', as: 'asset' });
PlatformOpsRevealChallenge.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Tenant.hasMany(Customer, { foreignKey: 'tenantId', as: 'customers' });
Customer.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Vendor, { foreignKey: 'tenantId', as: 'vendors' });
Vendor.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Quote, { foreignKey: 'tenantId', as: 'quotes' });
Quote.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(QuoteItem, { foreignKey: 'tenantId', as: 'quoteItems' });
QuoteItem.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Job, { foreignKey: 'tenantId', as: 'jobs' });
Job.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(JobItem, { foreignKey: 'tenantId', as: 'jobItems' });
JobItem.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(JobStatusHistory, { foreignKey: 'tenantId', as: 'jobStatusHistory' });
JobStatusHistory.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Invoice, { foreignKey: 'tenantId', as: 'invoices' });
Invoice.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(SubscriptionPayment, { foreignKey: 'tenantId', as: 'subscriptionPayments' });
SubscriptionPayment.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Payment, { foreignKey: 'tenantId', as: 'payments' });
Payment.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Expense, { foreignKey: 'tenantId', as: 'expenses' });
Expense.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Lead, { foreignKey: 'tenantId', as: 'leads' });
Lead.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(LeadActivity, { foreignKey: 'tenantId', as: 'leadActivities' });
LeadActivity.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(CustomerActivity, { foreignKey: 'tenantId', as: 'customerActivities' });
CustomerActivity.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(CustomerFeedback, { foreignKey: 'tenantId', as: 'customerFeedback' });
CustomerFeedback.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(QuoteActivity, { foreignKey: 'tenantId', as: 'quoteActivities' });
QuoteActivity.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(SaleActivity, { foreignKey: 'tenantId', as: 'saleActivities' });
SaleActivity.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Setting, { foreignKey: 'tenantId', as: 'settings' });
Setting.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Employee, { foreignKey: 'tenantId', as: 'employees' });
Employee.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(EmployeeDocument, { foreignKey: 'tenantId', as: 'employeeDocuments' });
EmployeeDocument.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(EmploymentHistory, { foreignKey: 'tenantId', as: 'employmentHistories' });
EmploymentHistory.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(PayrollRun, { foreignKey: 'tenantId', as: 'payrollRuns' });
PayrollRun.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(PayrollEntry, { foreignKey: 'tenantId', as: 'payrollEntries' });
PayrollEntry.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Account, { foreignKey: 'tenantId', as: 'accounts' });
Account.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(JournalEntry, { foreignKey: 'tenantId', as: 'journalEntries' });
JournalEntry.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(JournalEntryLine, { foreignKey: 'tenantId', as: 'journalEntryLines' });
JournalEntryLine.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(AccountBalance, { foreignKey: 'tenantId', as: 'accountBalances' });
AccountBalance.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(RecurringJournal, { foreignKey: 'tenantId', as: 'recurringJournals' });
RecurringJournal.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Tenant.hasMany(RecurringJournalRun, { foreignKey: 'tenantId', as: 'recurringJournalRuns' });
RecurringJournalRun.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
RecurringJournal.belongsTo(Account, { foreignKey: 'debitAccountId', as: 'debitAccount' });
RecurringJournal.belongsTo(Account, { foreignKey: 'creditAccountId', as: 'creditAccount' });
RecurringJournal.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
RecurringJournal.hasMany(RecurringJournalRun, { foreignKey: 'recurringJournalId', as: 'runs' });
RecurringJournalRun.belongsTo(RecurringJournal, { foreignKey: 'recurringJournalId', as: 'recurringJournal' });
RecurringJournalRun.belongsTo(JournalEntry, { foreignKey: 'journalEntryId', as: 'journalEntry' });

Tenant.hasMany(PricingTemplate, { foreignKey: 'tenantId', as: 'pricingTemplates' });
PricingTemplate.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(VendorPriceList, { foreignKey: 'tenantId', as: 'vendorPriceLists' });
VendorPriceList.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(CustomDropdownOption, { foreignKey: 'tenantId', as: 'customDropdownOptions' });
CustomDropdownOption.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(MaterialCategory, { foreignKey: 'tenantId', as: 'materialCategories' });
MaterialCategory.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(MaterialItem, { foreignKey: 'tenantId', as: 'materialItems' });
MaterialItem.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(MaterialMovement, { foreignKey: 'tenantId', as: 'materialMovements' });
MaterialMovement.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Customer.hasMany(Job, { foreignKey: 'customerId', as: 'jobs' });
Job.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

User.hasMany(Job, { foreignKey: 'assignedTo', as: 'assignedJobs' });
Job.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignedUser' });

User.hasMany(Job, { foreignKey: 'createdBy', as: 'jobsCreated' });
Job.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Customer.hasMany(Quote, { foreignKey: 'customerId', as: 'quotes' });
Quote.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

User.hasMany(Quote, { foreignKey: 'createdBy', as: 'quotesCreated' });
Quote.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Quote.hasMany(QuoteItem, { foreignKey: 'quoteId', as: 'items' });
QuoteItem.belongsTo(Quote, { foreignKey: 'quoteId', as: 'quote' });

Quote.hasMany(Job, { foreignKey: 'quoteId', as: 'jobs' });
Job.belongsTo(Quote, { foreignKey: 'quoteId', as: 'quote' });

Customer.hasMany(Payment, { foreignKey: 'customerId', as: 'payments' });
Payment.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Vendor.hasMany(Payment, { foreignKey: 'vendorId', as: 'payments' });
Payment.belongsTo(Vendor, { foreignKey: 'vendorId', as: 'vendor' });

Job.hasMany(Payment, { foreignKey: 'jobId', as: 'payments' });
Payment.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

Vendor.hasMany(Expense, { foreignKey: 'vendorId', as: 'expenses' });
Expense.belongsTo(Vendor, { foreignKey: 'vendorId', as: 'vendor' });

Job.hasMany(Expense, { foreignKey: 'jobId', as: 'expenses' });
Expense.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

User.hasMany(Expense, { foreignKey: 'submittedBy', as: 'submittedExpenses' });
Expense.belongsTo(User, { foreignKey: 'submittedBy', as: 'submitter' });

User.hasMany(Expense, { foreignKey: 'approvedBy', as: 'approvedExpenses' });
Expense.belongsTo(User, { foreignKey: 'approvedBy', as: 'approver' });

Vendor.hasMany(VendorPriceList, { foreignKey: 'vendorId', as: 'priceList' });
VendorPriceList.belongsTo(Vendor, { foreignKey: 'vendorId', as: 'vendor' });

Job.hasMany(JobItem, { foreignKey: 'jobId', as: 'items' });
JobItem.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
QuoteItem.hasMany(JobItem, { foreignKey: 'quoteItemId', as: 'jobItems' });
JobItem.belongsTo(QuoteItem, { foreignKey: 'quoteItemId', as: 'quoteItem' });

// Invoice relationships
Customer.hasMany(Invoice, { foreignKey: 'customerId', as: 'invoices' });
Invoice.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Job.hasMany(Invoice, { foreignKey: 'jobId', as: 'invoices' });
Invoice.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

Sale.hasMany(Invoice, { foreignKey: 'saleId', as: 'invoices' });
Invoice.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });

Prescription.hasMany(Invoice, { foreignKey: 'prescriptionId', as: 'invoices' });
Invoice.belongsTo(Prescription, { foreignKey: 'prescriptionId', as: 'prescription' });

Job.hasMany(JobStatusHistory, { foreignKey: 'jobId', as: 'statusHistory' });
JobStatusHistory.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
JobStatusHistory.belongsTo(User, { foreignKey: 'changedBy', as: 'changedByUser' });

// Invite token relationships
User.hasMany(InviteToken, { foreignKey: 'createdBy', as: 'invitesCreated' });
InviteToken.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

User.hasOne(InviteToken, { foreignKey: 'usedBy', as: 'inviteUsed' });
InviteToken.belongsTo(User, { foreignKey: 'usedBy', as: 'user' });
InviteToken.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

User.hasMany(PasswordResetToken, { foreignKey: 'userId', as: 'passwordResetTokens' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(EmailVerificationToken, { foreignKey: 'userId', as: 'emailVerificationTokens' });
EmailVerificationToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'recipient' });

User.hasMany(UserTodo, { foreignKey: 'userId', as: 'todos' });
UserTodo.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(UserWeekFocus, { foreignKey: 'userId', as: 'weekFocus' });
UserWeekFocus.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Tenant.hasMany(UserTask, { foreignKey: 'tenantId', as: 'workspaceTasks' });
UserTask.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
User.hasMany(UserTask, { foreignKey: 'userId', as: 'workspaceTasks' });
UserTask.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(UserTask, { foreignKey: 'assigneeId', as: 'assignedWorkspaceTasks' });
UserTask.belongsTo(User, { foreignKey: 'assigneeId', as: 'assignee' });

Tenant.hasMany(UserChecklist, { foreignKey: 'tenantId', as: 'workspaceChecklists' });
UserChecklist.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
User.hasMany(UserChecklist, { foreignKey: 'userId', as: 'workspaceChecklists' });
UserChecklist.belongsTo(User, { foreignKey: 'userId', as: 'user' });

UserChecklist.hasMany(UserChecklistItem, { foreignKey: 'checklistId', as: 'items' });
UserChecklistItem.belongsTo(UserChecklist, { foreignKey: 'checklistId', as: 'checklist' });
User.hasMany(UserChecklistItem, { foreignKey: 'userId', as: 'workspaceChecklistItems' });
UserChecklistItem.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Notification.belongsTo(User, { foreignKey: 'triggeredBy', as: 'actor' });
Notification.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

MaterialCategory.hasMany(MaterialItem, { foreignKey: 'categoryId', as: 'items' });
MaterialItem.belongsTo(MaterialCategory, { foreignKey: 'categoryId', as: 'category' });

Vendor.hasMany(MaterialItem, { foreignKey: 'preferredVendorId', as: 'materialItems' });
MaterialItem.belongsTo(Vendor, { foreignKey: 'preferredVendorId', as: 'preferredVendor' });

MaterialItem.hasMany(MaterialMovement, { foreignKey: 'itemId', as: 'movements' });
MaterialMovement.belongsTo(MaterialItem, { foreignKey: 'itemId', as: 'item' });

Tenant.hasMany(EquipmentCategory, { foreignKey: 'tenantId', as: 'equipmentCategories' });
EquipmentCategory.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Equipment, { foreignKey: 'tenantId', as: 'equipment' });
Equipment.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

EquipmentCategory.hasMany(Equipment, { foreignKey: 'categoryId', as: 'equipment' });
Equipment.belongsTo(EquipmentCategory, { foreignKey: 'categoryId', as: 'category' });

Vendor.hasMany(Equipment, { foreignKey: 'vendorId', as: 'equipment' });
Equipment.belongsTo(Vendor, { foreignKey: 'vendorId', as: 'vendor' });

Job.hasMany(MaterialMovement, { foreignKey: 'jobId', as: 'materialMovements' });
MaterialMovement.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

User.hasMany(MaterialMovement, { foreignKey: 'createdBy', as: 'materialMovementsCreated' });
MaterialMovement.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

User.hasMany(Lead, { foreignKey: 'assignedTo', as: 'assignedLeads' });
Lead.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignee' });
User.hasMany(Lead, { foreignKey: 'createdBy', as: 'createdLeads' });
Lead.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

Lead.hasMany(LeadActivity, { foreignKey: 'leadId', as: 'activities' });
LeadActivity.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
LeadActivity.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

Customer.hasMany(CustomerActivity, { foreignKey: 'customerId', as: 'activities' });
CustomerActivity.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
CustomerActivity.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

Quote.hasMany(QuoteActivity, { foreignKey: 'quoteId', as: 'activities' });
QuoteActivity.belongsTo(Quote, { foreignKey: 'quoteId', as: 'quote' });
QuoteActivity.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

Sale.hasMany(SaleActivity, { foreignKey: 'saleId', as: 'activities' });
SaleActivity.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
SaleActivity.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

Expense.hasMany(ExpenseActivity, { foreignKey: 'expenseId', as: 'activities' });
ExpenseActivity.belongsTo(Expense, { foreignKey: 'expenseId', as: 'expense' });
ExpenseActivity.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

Customer.hasMany(Lead, { foreignKey: 'convertedCustomerId', as: 'relatedLeads' });
Lead.belongsTo(Customer, { foreignKey: 'convertedCustomerId', as: 'convertedCustomer' });
Job.hasMany(Lead, { foreignKey: 'convertedJobId', as: 'linkedLeads' });
Lead.belongsTo(Job, { foreignKey: 'convertedJobId', as: 'convertedJob' });

// Admin job to admin lead relationship
Lead.hasMany(Job, { foreignKey: 'adminLeadId', as: 'adminJobs' });
Job.belongsTo(Lead, { foreignKey: 'adminLeadId', as: 'adminLead' });

// Platform Admin Roles relationships
PlatformAdminRole.belongsToMany(PlatformAdminPermission, {
  through: PlatformAdminRolePermission,
  foreignKey: 'roleId',
  otherKey: 'permissionId',
  as: 'permissions'
});

PlatformAdminPermission.belongsToMany(PlatformAdminRole, {
  through: PlatformAdminRolePermission,
  foreignKey: 'permissionId',
  otherKey: 'roleId',
  as: 'roles'
});

// Platform Admin User Roles relationships
User.hasMany(PlatformAdminUserRole, { foreignKey: 'userId', as: 'platformAdminUserRoles' });
PlatformAdminUserRole.belongsTo(User, { foreignKey: 'userId', as: 'user' });

PlatformAdminRole.hasMany(PlatformAdminUserRole, { foreignKey: 'roleId', as: 'userRoles' });
PlatformAdminUserRole.belongsTo(PlatformAdminRole, { foreignKey: 'roleId', as: 'role' });

User.belongsToMany(PlatformAdminRole, {
  through: PlatformAdminUserRole,
  foreignKey: 'userId',
  otherKey: 'roleId',
  as: 'platformAdminRoles'
});

PlatformAdminRole.belongsToMany(User, {
  through: PlatformAdminUserRole,
  foreignKey: 'roleId',
  otherKey: 'userId',
  as: 'users'
});

User.hasMany(Employee, { foreignKey: 'userId', as: 'linkedEmployee' });
Employee.belongsTo(User, { foreignKey: 'userId', as: 'userAccount' });

Employee.hasMany(EmployeeDocument, { foreignKey: 'employeeId', as: 'documents' });
EmployeeDocument.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });
EmployeeDocument.belongsTo(User, { foreignKey: 'uploadedBy', as: 'uploader' });

Employee.hasMany(EmploymentHistory, { foreignKey: 'employeeId', as: 'history' });
EmploymentHistory.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });

PayrollRun.hasMany(PayrollEntry, { foreignKey: 'payrollRunId', as: 'entries' });
PayrollEntry.belongsTo(PayrollRun, { foreignKey: 'payrollRunId', as: 'run' });
PayrollEntry.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });
Employee.hasMany(PayrollEntry, { foreignKey: 'employeeId', as: 'payrollEntries' });

JournalEntry.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
JournalEntry.belongsTo(User, { foreignKey: 'approvedBy', as: 'approver' });

JournalEntry.hasMany(JournalEntryLine, { foreignKey: 'journalEntryId', as: 'lines' });
JournalEntryLine.belongsTo(JournalEntry, { foreignKey: 'journalEntryId', as: 'journalEntry' });

Account.hasMany(JournalEntryLine, { foreignKey: 'accountId', as: 'journalLines' });
JournalEntryLine.belongsTo(Account, { foreignKey: 'accountId', as: 'account' });

Account.hasMany(AccountBalance, { foreignKey: 'accountId', as: 'balances' });
AccountBalance.belongsTo(Account, { foreignKey: 'accountId', as: 'account' });

Account.hasMany(Account, { foreignKey: 'parentId', as: 'children' });
Account.belongsTo(Account, { foreignKey: 'parentId', as: 'parent' });

// Tenant relationships
Tenant.hasMany(UserTenant, { foreignKey: 'tenantId', as: 'memberships' });
UserTenant.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

User.hasMany(UserTenant, { foreignKey: 'userId', as: 'tenantMemberships' });
UserTenant.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Tenant.belongsToMany(User, {
  through: UserTenant,
  foreignKey: 'tenantId',
  otherKey: 'userId',
  as: 'users'
});

User.belongsToMany(Tenant, {
  through: UserTenant,
  foreignKey: 'userId',
  otherKey: 'tenantId',
  as: 'tenants'
});

// Sabito tenant mapping relationships
SabitoTenantMapping.belongsTo(Tenant, { 
  foreignKey: 'nexproTenantId', 
  as: 'tenant' 
});

Tenant.hasMany(SabitoTenantMapping, { 
  foreignKey: 'nexproTenantId', 
  as: 'sabitoMappings' 
});

// Studio locations (multi-branch for studio workspaces)
Tenant.hasMany(StudioLocation, { foreignKey: 'tenantId', as: 'studioLocations' });
StudioLocation.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

User.belongsToMany(StudioLocation, {
  through: UserStudioLocation,
  foreignKey: 'userId',
  otherKey: 'studioLocationId',
  as: 'studioLocations',
});
StudioLocation.belongsToMany(User, {
  through: UserStudioLocation,
  foreignKey: 'studioLocationId',
  otherKey: 'userId',
  as: 'users',
});
UserStudioLocation.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
UserStudioLocation.belongsTo(User, { foreignKey: 'userId', as: 'user' });
StudioLocation.hasMany(UserStudioLocation, { foreignKey: 'studioLocationId', as: 'userAssignments' });

StudioLocation.hasMany(Customer, { foreignKey: 'studioLocationId', as: 'customers' });
Customer.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
Customer.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(Customer, { foreignKey: 'shopId', as: 'customers' });
StudioLocation.hasMany(Job, { foreignKey: 'studioLocationId', as: 'jobs' });
Job.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
StudioLocation.hasMany(Quote, { foreignKey: 'studioLocationId', as: 'quotes' });
Quote.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
StudioLocation.hasMany(Invoice, { foreignKey: 'studioLocationId', as: 'invoices' });
Invoice.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
StudioLocation.hasMany(Lead, { foreignKey: 'studioLocationId', as: 'leads' });
Lead.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
StudioLocation.hasMany(Expense, { foreignKey: 'studioLocationId', as: 'expenses' });
Expense.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
StudioLocation.hasMany(CustomerFeedback, { foreignKey: 'studioLocationId', as: 'customerFeedback' });
CustomerFeedback.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
StudioLocation.hasMany(UserTask, { foreignKey: 'studioLocationId', as: 'tasks' });
UserTask.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
StudioLocation.hasMany(MaterialItem, { foreignKey: 'studioLocationId', as: 'materialItems' });
MaterialItem.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
StudioLocation.hasMany(Equipment, { foreignKey: 'studioLocationId', as: 'equipment' });
Equipment.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });

// Shop Management Relationships
Tenant.hasMany(Shop, { foreignKey: 'tenantId', as: 'shops' });
Shop.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(UserTask, { foreignKey: 'shopId', as: 'tasks' });
UserTask.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

User.belongsToMany(Shop, {
  through: UserShop,
  foreignKey: 'userId',
  otherKey: 'shopId',
  as: 'shops',
});
Shop.belongsToMany(User, {
  through: UserShop,
  foreignKey: 'shopId',
  otherKey: 'userId',
  as: 'users',
});
UserShop.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
UserShop.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Shop.hasMany(UserShop, { foreignKey: 'shopId', as: 'userAssignments' });
Shop.belongsTo(User, { foreignKey: 'managerUserId', as: 'manager' });
StudioLocation.belongsTo(User, { foreignKey: 'managerUserId', as: 'manager' });

Tenant.hasMany(ProductCategory, { foreignKey: 'tenantId', as: 'productCategories' });
ProductCategory.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Product, { foreignKey: 'tenantId', as: 'products' });
Product.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Product.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(Product, { foreignKey: 'shopId', as: 'products' });
Product.belongsTo(ProductCategory, { foreignKey: 'categoryId', as: 'category' });
ProductCategory.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });

Tenant.hasMany(OnlineStoreSettings, { foreignKey: 'tenantId', as: 'onlineStoreSettings' });
OnlineStoreSettings.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(OnlineStoreSettings, { foreignKey: 'shopId', as: 'onlineStoreSettings' });
OnlineStoreSettings.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
StudioLocation.hasMany(OnlineStoreSettings, { foreignKey: 'studioLocationId', as: 'onlineStoreSettings' });
OnlineStoreSettings.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });

OnlineStoreHeroCategory.hasMany(OnlineStoreHeroDesign, { foreignKey: 'categoryId', as: 'designs' });
OnlineStoreHeroDesign.belongsTo(OnlineStoreHeroCategory, { foreignKey: 'categoryId', as: 'category' });
OnlineStoreHeroDesign.hasMany(OnlineStoreHeroColorway, { foreignKey: 'designId', as: 'colorways' });
OnlineStoreHeroColorway.belongsTo(OnlineStoreHeroDesign, { foreignKey: 'designId', as: 'design' });

Tenant.hasMany(OnlineServiceListing, { foreignKey: 'tenantId', as: 'onlineServiceListings' });
OnlineServiceListing.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
StudioLocation.hasMany(OnlineServiceListing, { foreignKey: 'studioLocationId', as: 'onlineServiceListings' });
OnlineServiceListing.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
PricingTemplate.hasMany(OnlineServiceListing, { foreignKey: 'pricingTemplateId', as: 'onlineServiceListings' });
OnlineServiceListing.belongsTo(PricingTemplate, { foreignKey: 'pricingTemplateId', as: 'pricingTemplate' });

Tenant.hasMany(OnlineProductListing, { foreignKey: 'tenantId', as: 'onlineProductListings' });
OnlineProductListing.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(OnlineProductListing, { foreignKey: 'shopId', as: 'onlineProductListings' });
OnlineProductListing.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Product.hasMany(OnlineProductListing, { foreignKey: 'productId', as: 'onlineListings' });
OnlineProductListing.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

Product.hasMany(ProductVariant, { foreignKey: 'productId', as: 'variants' });
ProductVariant.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

Tenant.hasMany(ProductStockMovement, { foreignKey: 'tenantId', as: 'productStockMovements' });
ProductStockMovement.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Product.hasMany(ProductStockMovement, { foreignKey: 'productId', as: 'stockMovements' });
ProductStockMovement.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
ProductVariant.hasMany(ProductStockMovement, { foreignKey: 'productVariantId', as: 'stockMovements' });
ProductStockMovement.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });
ProductStockMovement.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });
ProductStockMovement.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

Tenant.hasMany(ProductShopStock, { foreignKey: 'tenantId', as: 'productShopStocks' });
ProductShopStock.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Product.hasMany(ProductShopStock, { foreignKey: 'productId', as: 'shopStocks' });
ProductShopStock.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
ProductVariant.hasMany(ProductShopStock, { foreignKey: 'productVariantId', as: 'shopStocks' });
ProductShopStock.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });
ProductShopStock.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(ProductShopStock, { foreignKey: 'shopId', as: 'productShopStocks' });
ProductVariant.hasMany(OnlineProductListing, { foreignKey: 'productVariantId', as: 'onlineListings' });
OnlineProductListing.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });

StorefrontCustomer.hasMany(StorefrontWishlistItem, { foreignKey: 'storefrontCustomerId', as: 'wishlistItems' });
StorefrontWishlistItem.belongsTo(StorefrontCustomer, { foreignKey: 'storefrontCustomerId', as: 'storefrontCustomer' });
Tenant.hasMany(StorefrontWishlistItem, { foreignKey: 'tenantId', as: 'storefrontWishlistItems' });
StorefrontWishlistItem.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(StorefrontWishlistItem, { foreignKey: 'shopId', as: 'storefrontWishlistItems' });
StorefrontWishlistItem.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
OnlineProductListing.hasMany(StorefrontWishlistItem, { foreignKey: 'listingId', as: 'wishlistItems' });
StorefrontWishlistItem.belongsTo(OnlineProductListing, { foreignKey: 'listingId', as: 'listing' });
Product.hasMany(StorefrontWishlistItem, { foreignKey: 'productId', as: 'storefrontWishlistItems' });
StorefrontWishlistItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
ProductVariant.hasMany(StorefrontWishlistItem, { foreignKey: 'productVariantId', as: 'storefrontWishlistItems' });
StorefrontWishlistItem.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });

StorefrontCustomer.hasMany(StorefrontReview, { foreignKey: 'storefrontCustomerId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(StorefrontCustomer, { foreignKey: 'storefrontCustomerId', as: 'storefrontCustomer' });
Tenant.hasMany(StorefrontReview, { foreignKey: 'tenantId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(StorefrontReview, { foreignKey: 'shopId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
OnlineProductListing.hasMany(StorefrontReview, { foreignKey: 'listingId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(OnlineProductListing, { foreignKey: 'listingId', as: 'listing' });
Product.hasMany(StorefrontReview, { foreignKey: 'productId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
ProductVariant.hasMany(StorefrontReview, { foreignKey: 'productVariantId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });
Sale.hasMany(StorefrontReview, { foreignKey: 'saleId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
SaleItem.hasMany(StorefrontReview, { foreignKey: 'saleItemId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(SaleItem, { foreignKey: 'saleItemId', as: 'saleItem' });
OnlineServiceListing.hasMany(StorefrontReview, { foreignKey: 'serviceListingId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(OnlineServiceListing, { foreignKey: 'serviceListingId', as: 'serviceListing' });
StudioLocation.hasMany(StorefrontReview, { foreignKey: 'studioLocationId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
Job.hasMany(StorefrontReview, { foreignKey: 'jobId', as: 'storefrontReviews' });
StorefrontReview.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

Tenant.hasMany(Barcode, { foreignKey: 'tenantId', as: 'barcodes' });
Barcode.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Barcode.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Product.hasMany(Barcode, { foreignKey: 'productId', as: 'barcodes' });
Barcode.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'productVariant' });
ProductVariant.hasMany(Barcode, { foreignKey: 'productVariantId', as: 'barcodes' });

Tenant.hasMany(Sale, { foreignKey: 'tenantId', as: 'sales' });
Sale.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Sale.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(Sale, { foreignKey: 'shopId', as: 'sales' });
Shop.hasMany(Expense, { foreignKey: 'shopId', as: 'expenses' });
Expense.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(Invoice, { foreignKey: 'shopId', as: 'invoices' });
Invoice.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(Vendor, { foreignKey: 'shopId', as: 'vendors' });
Vendor.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(Equipment, { foreignKey: 'shopId', as: 'equipment' });
Equipment.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(Quote, { foreignKey: 'shopId', as: 'quotes' });
Quote.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(MaterialItem, { foreignKey: 'shopId', as: 'materialItems' });
MaterialItem.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Sale.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Customer.hasMany(Sale, { foreignKey: 'customerId', as: 'sales' });
Shop.hasMany(Dealer, { foreignKey: 'shopId', as: 'dealers' });
Dealer.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Dealer.hasMany(Sale, { foreignKey: 'dealerId', as: 'sales' });
Sale.belongsTo(Dealer, { foreignKey: 'dealerId', as: 'dealer' });
Tenant.hasMany(Dealer, { foreignKey: 'tenantId', as: 'dealers' });
Dealer.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Tenant.hasMany(DealerPriceTier, { foreignKey: 'tenantId', as: 'dealerPriceTiers' });
DealerPriceTier.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Dealer.belongsTo(DealerPriceTier, { foreignKey: 'priceTierId', as: 'priceTier' });
DealerPriceTier.hasMany(Dealer, { foreignKey: 'priceTierId', as: 'dealers' });
Tenant.hasMany(DealerProductPrice, { foreignKey: 'tenantId', as: 'dealerProductPrices' });
DealerProductPrice.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(DealerProductPrice, { foreignKey: 'shopId', as: 'dealerProductPrices' });
DealerProductPrice.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Dealer.hasMany(DealerProductPrice, { foreignKey: 'dealerId', as: 'productPrices' });
DealerProductPrice.belongsTo(Dealer, { foreignKey: 'dealerId', as: 'dealer' });
DealerPriceTier.hasMany(DealerProductPrice, { foreignKey: 'priceTierId', as: 'productPrices' });
DealerProductPrice.belongsTo(DealerPriceTier, { foreignKey: 'priceTierId', as: 'priceTier' });
DealerProductPrice.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Product.hasMany(DealerProductPrice, { foreignKey: 'productId', as: 'dealerPrices' });
DealerProductPrice.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });
ProductVariant.hasMany(DealerProductPrice, { foreignKey: 'productVariantId', as: 'dealerPrices' });
Tenant.hasMany(DealerLedgerEntry, { foreignKey: 'tenantId', as: 'dealerLedgerEntries' });
DealerLedgerEntry.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Dealer.hasMany(DealerLedgerEntry, { foreignKey: 'dealerId', as: 'ledgerEntries' });
DealerLedgerEntry.belongsTo(Dealer, { foreignKey: 'dealerId', as: 'dealer' });
Shop.hasMany(DealerLedgerEntry, { foreignKey: 'shopId', as: 'dealerLedgerEntries' });
DealerLedgerEntry.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Sale.hasMany(DealerLedgerEntry, { foreignKey: 'saleId', as: 'dealerLedgerEntries' });
DealerLedgerEntry.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
Payment.hasMany(DealerLedgerEntry, { foreignKey: 'paymentId', as: 'dealerLedgerEntries' });
DealerLedgerEntry.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
DealerLedgerEntry.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });
Dealer.hasMany(Payment, { foreignKey: 'dealerId', as: 'payments' });
Payment.belongsTo(Dealer, { foreignKey: 'dealerId', as: 'dealer' });
Sale.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
// Note: Invoice.belongsTo(Sale) is already defined above with alias 'sale', so we don't need Invoice.hasOne(Sale)
Sale.belongsTo(User, { foreignKey: 'soldBy', as: 'seller' });
User.hasMany(Sale, { foreignKey: 'soldBy', as: 'sales' });

Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });
SaleItem.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
SaleItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Product.hasMany(SaleItem, { foreignKey: 'productId', as: 'saleItems' });
SaleItem.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });
ProductVariant.hasMany(SaleItem, { foreignKey: 'productVariantId', as: 'saleItems' });

Tenant.hasMany(SaleReturn, { foreignKey: 'tenantId', as: 'saleReturns' });
SaleReturn.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(SaleReturn, { foreignKey: 'shopId', as: 'saleReturns' });
SaleReturn.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Sale.hasMany(SaleReturn, { foreignKey: 'originalSaleId', as: 'returns' });
SaleReturn.belongsTo(Sale, { foreignKey: 'originalSaleId', as: 'originalSale' });
SaleReturn.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
SaleReturn.hasMany(SaleReturnItem, { foreignKey: 'saleReturnId', as: 'items' });
SaleReturnItem.belongsTo(SaleReturn, { foreignKey: 'saleReturnId', as: 'saleReturn' });
SaleReturnItem.belongsTo(SaleItem, { foreignKey: 'saleItemId', as: 'saleItem' });
SaleReturnItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
SaleReturnItem.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });
SaleReturn.hasMany(SaleReturnExchangeItem, { foreignKey: 'saleReturnId', as: 'exchangeItems' });
SaleReturnExchangeItem.belongsTo(SaleReturn, { foreignKey: 'saleReturnId', as: 'saleReturn' });
SaleReturnExchangeItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
SaleReturnExchangeItem.belongsTo(ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });

Tenant.hasMany(MarketplaceOrderPayment, { foreignKey: 'tenantId', as: 'marketplaceOrderPayments' });
MarketplaceOrderPayment.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(MarketplaceOrderPayment, { foreignKey: 'shopId', as: 'marketplaceOrderPayments' });
MarketplaceOrderPayment.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Sale.hasOne(MarketplaceOrderPayment, { foreignKey: 'saleId', as: 'marketplacePayment' });
MarketplaceOrderPayment.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
StorefrontCustomer.hasMany(MarketplaceOrderPayment, { foreignKey: 'storefrontCustomerId', as: 'marketplaceOrderPayments' });
MarketplaceOrderPayment.belongsTo(StorefrontCustomer, { foreignKey: 'storefrontCustomerId', as: 'storefrontCustomer' });

Tenant.hasMany(MarketplaceLedgerEntry, { foreignKey: 'tenantId', as: 'marketplaceLedgerEntries' });
MarketplaceLedgerEntry.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(MarketplaceLedgerEntry, { foreignKey: 'shopId', as: 'marketplaceLedgerEntries' });
MarketplaceLedgerEntry.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Sale.hasMany(MarketplaceLedgerEntry, { foreignKey: 'saleId', as: 'marketplaceLedgerEntries' });
MarketplaceLedgerEntry.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
MarketplaceOrderPayment.hasMany(MarketplaceLedgerEntry, { foreignKey: 'marketplaceOrderPaymentId', as: 'ledgerEntries' });
MarketplaceLedgerEntry.belongsTo(MarketplaceOrderPayment, { foreignKey: 'marketplaceOrderPaymentId', as: 'marketplaceOrderPayment' });

Tenant.hasMany(MarketplacePayout, { foreignKey: 'tenantId', as: 'marketplacePayouts' });
MarketplacePayout.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(MarketplacePayout, { foreignKey: 'shopId', as: 'marketplacePayouts' });
MarketplacePayout.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Sale.hasMany(MarketplacePayout, { foreignKey: 'saleId', as: 'marketplacePayouts' });
MarketplacePayout.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
MarketplaceOrderPayment.hasMany(MarketplacePayout, { foreignKey: 'marketplaceOrderPaymentId', as: 'payouts' });
MarketplacePayout.belongsTo(MarketplaceOrderPayment, { foreignKey: 'marketplaceOrderPaymentId', as: 'marketplaceOrderPayment' });
User.hasMany(MarketplacePayout, { foreignKey: 'releasedBy', as: 'marketplacePayoutsReleased' });
MarketplacePayout.belongsTo(User, { foreignKey: 'releasedBy', as: 'releasedByUser' });
MarketplacePayout.hasMany(MarketplaceLedgerEntry, { foreignKey: 'marketplacePayoutId', as: 'ledgerEntries' });
MarketplaceLedgerEntry.belongsTo(MarketplacePayout, { foreignKey: 'marketplacePayoutId', as: 'marketplacePayout' });

Tenant.hasMany(MarketplaceDispute, { foreignKey: 'tenantId', as: 'marketplaceDisputes' });
MarketplaceDispute.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(MarketplaceDispute, { foreignKey: 'shopId', as: 'marketplaceDisputes' });
MarketplaceDispute.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Sale.hasMany(MarketplaceDispute, { foreignKey: 'saleId', as: 'marketplaceDisputes' });
MarketplaceDispute.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
MarketplaceOrderPayment.hasMany(MarketplaceDispute, { foreignKey: 'marketplaceOrderPaymentId', as: 'disputes' });
MarketplaceDispute.belongsTo(MarketplaceOrderPayment, { foreignKey: 'marketplaceOrderPaymentId', as: 'marketplaceOrderPayment' });
StorefrontCustomer.hasMany(MarketplaceDispute, { foreignKey: 'storefrontCustomerId', as: 'marketplaceDisputes' });
MarketplaceDispute.belongsTo(StorefrontCustomer, { foreignKey: 'storefrontCustomerId', as: 'storefrontCustomer' });
User.hasMany(MarketplaceDispute, { foreignKey: 'resolvedBy', as: 'marketplaceDisputesResolved' });
MarketplaceDispute.belongsTo(User, { foreignKey: 'resolvedBy', as: 'resolvedByUser' });

// Pharmacy Management Relationships
Tenant.hasMany(Pharmacy, { foreignKey: 'tenantId', as: 'pharmacies' });
Pharmacy.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Drug, { foreignKey: 'tenantId', as: 'drugs' });
Drug.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Drug.belongsTo(Pharmacy, { foreignKey: 'pharmacyId', as: 'pharmacy' });
Pharmacy.hasMany(Drug, { foreignKey: 'pharmacyId', as: 'drugs' });
Drug.belongsTo(MaterialCategory, { foreignKey: 'categoryId', as: 'category' });
MaterialCategory.hasMany(Drug, { foreignKey: 'categoryId', as: 'drugs' });

Tenant.hasMany(Prescription, { foreignKey: 'tenantId', as: 'prescriptions' });
Prescription.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Prescription.belongsTo(Pharmacy, { foreignKey: 'pharmacyId', as: 'pharmacy' });
Pharmacy.hasMany(Prescription, { foreignKey: 'pharmacyId', as: 'prescriptions' });
Prescription.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Customer.hasMany(Prescription, { foreignKey: 'customerId', as: 'prescriptions' });
Prescription.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
// Note: Invoice.belongsTo(Prescription) is already defined above with alias 'prescription', so we don't need Invoice.hasOne(Prescription)
Prescription.belongsTo(User, { foreignKey: 'filledBy', as: 'filler' });
User.hasMany(Prescription, { foreignKey: 'filledBy', as: 'prescriptions' });

Prescription.hasMany(PrescriptionItem, { foreignKey: 'prescriptionId', as: 'items' });
PrescriptionItem.belongsTo(Prescription, { foreignKey: 'prescriptionId', as: 'prescription' });
PrescriptionItem.belongsTo(Drug, { foreignKey: 'drugId', as: 'drug' });
Drug.hasMany(PrescriptionItem, { foreignKey: 'drugId', as: 'prescriptionItems' });

Tenant.hasMany(DrugInteraction, { foreignKey: 'tenantId', as: 'drugInteractions' });
DrugInteraction.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
DrugInteraction.belongsTo(Drug, { foreignKey: 'drug1Id', as: 'drug1' });
DrugInteraction.belongsTo(Drug, { foreignKey: 'drug2Id', as: 'drug2' });
Drug.hasMany(DrugInteraction, { foreignKey: 'drug1Id', as: 'interactionsAsDrug1' });
Drug.hasMany(DrugInteraction, { foreignKey: 'drug2Id', as: 'interactionsAsDrug2' });

Tenant.hasMany(ExpiryAlert, { foreignKey: 'tenantId', as: 'expiryAlerts' });
ExpiryAlert.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
ExpiryAlert.belongsTo(Drug, { foreignKey: 'drugId', as: 'drug' });
Drug.hasMany(ExpiryAlert, { foreignKey: 'drugId', as: 'expiryAlerts' });
ExpiryAlert.belongsTo(User, { foreignKey: 'acknowledgedBy', as: 'acknowledger' });
User.hasMany(ExpiryAlert, { foreignKey: 'acknowledgedBy', as: 'acknowledgedAlerts' });

// Foot Traffic Relationships
Tenant.hasMany(FootTraffic, { foreignKey: 'tenantId', as: 'footTraffic' });
FootTraffic.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
FootTraffic.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(FootTraffic, { foreignKey: 'shopId', as: 'footTraffic' });
FootTraffic.belongsTo(User, { foreignKey: 'recordedBy', as: 'recorder' });
User.hasMany(FootTraffic, { foreignKey: 'recordedBy', as: 'recordedTraffic' });

// Stock transfer relationships
Tenant.hasMany(StockTransfer, { foreignKey: 'tenantId', as: 'stockTransfers' });
StockTransfer.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Shop.hasMany(StockTransfer, { foreignKey: 'sourceShopId', as: 'stockTransfersOut' });
StockTransfer.belongsTo(Shop, { foreignKey: 'sourceShopId', as: 'sourceShop' });
Shop.hasMany(StockTransfer, { foreignKey: 'destinationShopId', as: 'stockTransfersIn' });
StockTransfer.belongsTo(Shop, { foreignKey: 'destinationShopId', as: 'destinationShop' });
Product.hasMany(StockTransfer, { foreignKey: 'sourceProductId', as: 'stockTransfersOut' });
StockTransfer.belongsTo(Product, { foreignKey: 'sourceProductId', as: 'sourceProduct' });
Product.hasMany(StockTransfer, { foreignKey: 'destinationProductId', as: 'stockTransfersIn' });
StockTransfer.belongsTo(Product, { foreignKey: 'destinationProductId', as: 'destinationProduct' });
ProductVariant.hasMany(StockTransfer, { foreignKey: 'sourceVariantId', as: 'stockTransfersOut' });
StockTransfer.belongsTo(ProductVariant, { foreignKey: 'sourceVariantId', as: 'sourceVariant' });
ProductVariant.hasMany(StockTransfer, { foreignKey: 'destinationVariantId', as: 'stockTransfersIn' });
StockTransfer.belongsTo(ProductVariant, { foreignKey: 'destinationVariantId', as: 'destinationVariant' });
User.hasMany(StockTransfer, { foreignKey: 'createdBy', as: 'stockTransfersCreated' });
StockTransfer.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// Tenant access audit relationships
Tenant.hasMany(TenantAccessAudit, { foreignKey: 'tenantId', as: 'accessAuditLogs' });
TenantAccessAudit.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
User.hasMany(TenantAccessAudit, { foreignKey: 'actorUserId', as: 'tenantAccessAuditEntries' });
TenantAccessAudit.belongsTo(User, { foreignKey: 'actorUserId', as: 'actor' });

Tenant.hasMany(SupportTicket, { foreignKey: 'tenantId', as: 'supportTickets' });
SupportTicket.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
User.hasMany(SupportTicket, { foreignKey: 'createdBy', as: 'supportTicketsCreated' });
SupportTicket.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
User.hasMany(SupportTicket, { foreignKey: 'assignedTo', as: 'supportTicketsAssigned' });
SupportTicket.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignee' });

Tenant.hasMany(SupportAccessSession, { foreignKey: 'tenantId', as: 'supportAccessSessions' });
SupportAccessSession.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
User.hasMany(SupportAccessSession, { foreignKey: 'adminUserId', as: 'supportAccessSessions' });
SupportAccessSession.belongsTo(User, { foreignKey: 'adminUserId', as: 'adminUser' });
SupportAccessSession.belongsTo(SupportTicket, { foreignKey: 'supportTicketId', as: 'supportTicket' });
SupportTicket.hasMany(SupportAccessSession, { foreignKey: 'supportTicketId', as: 'supportSessions' });

Tenant.hasMany(AutomationRule, { foreignKey: 'tenantId', as: 'automationRules' });
AutomationRule.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
AutomationRule.hasMany(AutomationRun, { foreignKey: 'ruleId', as: 'runs' });
AutomationRun.belongsTo(AutomationRule, { foreignKey: 'ruleId', as: 'rule' });
Tenant.hasMany(AutomationRun, { foreignKey: 'tenantId', as: 'automationRuns' });
AutomationRun.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
AutomationRule.hasMany(AutomationDelayedRun, { foreignKey: 'ruleId', as: 'delayedRuns' });
AutomationDelayedRun.belongsTo(AutomationRule, { foreignKey: 'ruleId', as: 'rule' });
Shop.hasMany(AutomationRule, { foreignKey: 'shopId', as: 'automationRules' });
AutomationRule.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
StudioLocation.hasMany(AutomationRule, { foreignKey: 'studioLocationId', as: 'automationRules' });
AutomationRule.belongsTo(StudioLocation, { foreignKey: 'studioLocationId', as: 'studioLocation' });
Tenant.hasMany(AutomationDelayedRun, { foreignKey: 'tenantId', as: 'automationDelayedRuns' });
AutomationDelayedRun.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Tenant.hasMany(WhatsAppMessageEvent, { foreignKey: 'tenantId', as: 'whatsAppMessageEvents' });
WhatsAppMessageEvent.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Tenant.hasMany(MarketingCampaign, { foreignKey: 'tenantId', as: 'marketingCampaigns' });
MarketingCampaign.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
MarketingCampaign.hasMany(WhatsAppMessageEvent, { foreignKey: 'campaignId', as: 'whatsAppMessageEvents' });
WhatsAppMessageEvent.belongsTo(MarketingCampaign, { foreignKey: 'campaignId', as: 'campaign' });

// Sales agent growth attribution
SalesAgent.hasMany(SalesAgentCode, { foreignKey: 'salesAgentId', as: 'codes' });
SalesAgentCode.belongsTo(SalesAgent, { foreignKey: 'salesAgentId', as: 'agent' });
SalesAgent.hasMany(SalesAgentCommission, { foreignKey: 'salesAgentId', as: 'commissions' });
SalesAgentCommission.belongsTo(SalesAgent, { foreignKey: 'salesAgentId', as: 'agent' });
SalesAgent.hasMany(Tenant, { foreignKey: 'referredByAgentId', as: 'referredTenants' });
Tenant.belongsTo(SalesAgent, { foreignKey: 'referredByAgentId', as: 'referredByAgent' });
SalesAgentCommission.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Tenant.hasMany(SalesAgentCommission, { foreignKey: 'tenantId', as: 'salesAgentCommissions' });
SalesAgentCommission.belongsTo(SubscriptionPayment, {
  foreignKey: 'subscriptionPaymentId',
  as: 'subscriptionPayment',
});
SubscriptionPayment.hasMany(SalesAgentCommission, {
  foreignKey: 'subscriptionPaymentId',
  as: 'salesAgentCommissions',
});

// Sabito Partner Program
Tenant.hasOne(PartnerProgramSettings, { foreignKey: 'tenantId', as: 'partnerProgramSettings' });
PartnerProgramSettings.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
PartnerProgramSettings.hasMany(PartnerProgramService, {
  foreignKey: 'partnerProgramSettingsId',
  as: 'services',
});
PartnerProgramService.belongsTo(PartnerProgramSettings, {
  foreignKey: 'partnerProgramSettingsId',
  as: 'settings',
});
PartnerProgramService.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
PartnerProgramService.belongsTo(PricingTemplate, { foreignKey: 'pricingTemplateId', as: 'pricingTemplate' });
PartnerProgramService.belongsTo(OnlineServiceListing, {
  foreignKey: 'onlineServiceListingId',
  as: 'onlineServiceListing',
});

Marketer.hasMany(PartnershipApplication, { foreignKey: 'marketerId', as: 'applications' });
PartnershipApplication.belongsTo(Marketer, { foreignKey: 'marketerId', as: 'marketer' });
Tenant.hasMany(PartnershipApplication, { foreignKey: 'tenantId', as: 'partnershipApplications' });
PartnershipApplication.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Marketer.hasMany(Partnership, { foreignKey: 'marketerId', as: 'partnerships' });
Partnership.belongsTo(Marketer, { foreignKey: 'marketerId', as: 'marketer' });
Tenant.hasMany(Partnership, { foreignKey: 'tenantId', as: 'partnerships' });
Partnership.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Partnership.belongsTo(PartnershipApplication, { foreignKey: 'applicationId', as: 'application' });

Partnership.hasMany(PartnerCommission, { foreignKey: 'partnershipId', as: 'commissions' });
PartnerCommission.belongsTo(Partnership, { foreignKey: 'partnershipId', as: 'partnership' });
Marketer.hasMany(PartnerCommission, { foreignKey: 'marketerId', as: 'commissions' });
PartnerCommission.belongsTo(Marketer, { foreignKey: 'marketerId', as: 'marketer' });
Tenant.hasMany(PartnerCommission, { foreignKey: 'tenantId', as: 'partnerCommissions' });
PartnerCommission.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
PartnerCommission.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
PartnerCommission.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
PartnerCommission.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
PartnerCommission.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

Marketer.hasMany(PartnerReferral, { foreignKey: 'marketerId', as: 'referrals' });
PartnerReferral.belongsTo(Marketer, { foreignKey: 'marketerId', as: 'marketer' });
Tenant.hasMany(PartnerReferral, { foreignKey: 'tenantId', as: 'partnerReferrals' });
PartnerReferral.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Partnership.hasMany(PartnerReferral, { foreignKey: 'partnershipId', as: 'referrals' });
PartnerReferral.belongsTo(Partnership, { foreignKey: 'partnershipId', as: 'partnership' });
PartnerReferral.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Marketer.hasMany(PartnerCashoutRequest, { foreignKey: 'marketerId', as: 'cashouts' });
PartnerCashoutRequest.belongsTo(Marketer, { foreignKey: 'marketerId', as: 'marketer' });
Tenant.hasMany(PartnerCashoutRequest, { foreignKey: 'tenantId', as: 'partnerCashouts' });
PartnerCashoutRequest.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
PartnerCashoutRequest.hasMany(PartnerCommission, { foreignKey: 'cashoutRequestId', as: 'commissions' });
PartnerCommission.belongsTo(PartnerCashoutRequest, { foreignKey: 'cashoutRequestId', as: 'cashoutRequest' });

Customer.belongsTo(Marketer, { foreignKey: 'partnerMarketerId', as: 'partnerMarketer' });
Customer.belongsTo(Partnership, { foreignKey: 'partnershipId', as: 'partnership' });
Sale.belongsTo(Marketer, { foreignKey: 'partnerMarketerId', as: 'partnerMarketer' });
Sale.belongsTo(Partnership, { foreignKey: 'partnershipId', as: 'partnership' });
Job.belongsTo(Marketer, { foreignKey: 'partnerMarketerId', as: 'partnerMarketer' });
Job.belongsTo(Partnership, { foreignKey: 'partnershipId', as: 'partnership' });

module.exports = {
  User,
  Customer,
  Vendor,
  Job,
  Payment,
  Expense,
  PricingTemplate,
  VendorPriceList,
  JobItem,
  Quote,
  QuoteItem,
  JobStatusHistory,
  Invoice,
  InviteToken,
  PasswordResetToken,
  EmailVerificationToken,
  Notification,
  MaterialCategory,
  MaterialItem,
  MaterialMovement,
  EquipmentCategory,
  Equipment,
  Lead,
  LeadActivity,
  CustomerActivity,
  CustomerFeedback,
  QuoteActivity,
  SaleActivity,
  ExpenseActivity,
  Setting,
  Employee,
  EmployeeDocument,
  EmploymentHistory,
  PayrollRun,
  PayrollEntry,
  Account,
  JournalEntry,
  JournalEntryLine,
  AccountBalance,
  RecurringJournal,
  RecurringJournalRun,
  Tenant,
  UserTenant,
  SubscriptionPlan,
  SubscriptionPayment,
  CustomDropdownOption,
  SabitoTenantMapping,
  // Shop Management
  Shop,
  ProductCategory,
  Product,
  ProductStockMovement,
  ProductShopStock,
  Sale,
  SaleItem,
  SaleReturn,
  SaleReturnItem,
  SaleReturnExchangeItem,
  ProductVariant,
  Barcode,
  // Pharmacy Management
  Pharmacy,
  Drug,
  Prescription,
  PrescriptionItem,
  DrugInteraction,
  ExpiryAlert,
  // Retail Intelligence
  FootTraffic,
  StockCount,
  StockCountItem,
  StockTransfer,
  // Platform Admin Roles
  PlatformAdminRole,
  PlatformAdminPermission,
  PlatformAdminRolePermission,
  PlatformAdminUserRole,
  UserTodo,
  UserWeekFocus,
  UserTask,
  UserChecklist,
  UserChecklistItem,
  TenantAccessAudit,
  SupportTicket,
  SupportAccessSession,
  AutomationRule,
  AutomationRun,
  AutomationDelayedRun,
  WhatsAppMessageEvent,
  MarketingCampaign,
  StudioLocation,
  UserStudioLocation,
  UserShop,
  OnlineStoreSettings,
  OnlineStoreHeroCategory,
  OnlineStoreHeroDesign,
  OnlineStoreHeroColorway,
  OnlineProductListing,
  OnlineServiceListing,
  StorefrontCustomer,
  StorefrontWishlistItem,
  StorefrontReview,
  MarketplaceOrderPayment,
  MarketplaceLedgerEntry,
  MarketplacePayout,
  MarketplaceDispute,
  Dealer,
  DealerLedgerEntry,
  DealerPriceTier,
  DealerProductPrice,
  SalesAgent,
  SalesAgentCode,
  SalesAgentCommission,
  PartnerProgramSettings,
  PartnerProgramService,
  Marketer,
  PartnershipApplication,
  Partnership,
  PartnerCommission,
  PartnerReferral,
  PartnerCashoutRequest,
  DeliveryEvent,
  SystemHealthIssue,
  PlatformOpsAsset,
  PlatformOpsSecretReveal,
  PlatformOpsRevealChallenge,
};


