const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { sequelize, testConnection } = require('../config/database');
const models = require('../models');
const addUserFields = require('./add-user-fields');
const createInviteTokens = require('./create-invite-tokens');
const createPasswordResetTokens = require('./create-password-reset-tokens');
const createEmailVerificationTokens = require('./create-email-verification-tokens');
const addEmailVerifiedAtToUsers = require('./add-email-verified-at-to-users');
const updateJobStatuses = require('./update-job-statuses');
const updateVendorPriceListImageUrl = require('./update-vendor-price-list-image-url');
const updateFileStorageToText = require('./update-file-storage-to-text');
const addCreatedByToLeads = require('./add-createdBy-to-leads');
const addIsArchivedToExpenses = require('./add-isArchived-to-expenses');
const fixExpenseNumberUniqueConstraint = require('./fix-expense-number-unique-constraint');
const addPerformanceIndexes = require('./add-performance-indexes');
const addNotificationsPerformanceIndexes = require('./add-notifications-performance-indexes');
const addImageUrlToProducts = require('./add-imageUrl-to-products');
const alterProductsImageUrlToText = require('./alter-products-imageUrl-to-text');
const addTrackStockToProducts = require('./add-trackStock-to-products');
const addOrderStatusToSales = require('./add-orderStatus-to-sales');
const allowNullProductIdOnSaleItems = require('./allow-null-productId-on-sale-items');
const addDeliveryFeeFieldsToSales = require('./add-delivery-fee-fields-to-sales');
const addClientIdToSales = require('./add-clientId-to-sales');
const createProductCategoriesAndSwitchProducts = require('./create-product-categories-and-switch-products');
const addBusinessTypeToProductCategories = require('./add-business-type-to-product-categories');
const addShopTypeToProductCategories = require('./add-shop-type-to-product-categories');
const addBusinessTypeToInventoryCategories = require('./add-business-type-to-inventory-categories');
const seedDefaultProductCategories = require('./seed-default-product-categories');
const backfillCategoriesForExistingTenants = require('./backfill-categories-for-existing-tenants');
const addEmailPhoneUniqueConstraints = require('./add-email-phone-unique-constraints');
const fixUniquenessPerTenant = require('./fix-uniqueness-per-tenant');
const renameInventoryTablesToMaterials = require('./rename-inventory-tables-to-materials');
const addPartiallyPaidToSalesStatus = require('./add-partially-paid-to-sales-status');
const addQuoteInvoiceSaleFlow = require('./add-quote-invoice-sale-flow');
const addViewTokenToQuotes = require('./add-view-token-to-quotes');
const addViewTokenToJobs = require('./add-view-token-to-jobs');
const allowNullTenantIdInSettings = require('./allow-null-tenantId-in-settings');
const addInviteEmailStatusFields = require('./add-invite-email-status-fields');
const addNotificationPreferencesToUsers = require('./add-notification-preferences-to-users');
const addTaxToQuotes = require('./add-tax-to-quotes');
const addAttachmentsToQuotes = require('./add-attachments-to-quotes');
const addStudioQuotationFieldsToQuotes = require('./add-studio-quotation-fields-to-quotes');
const addJobQueryIndexes = require('./add-job-query-indexes');
const createUserTasksTable = require('./create-user-tasks-table');
const addAssigneeToUserTasks = require('./add-assignee-to-user-tasks');
const addTaskAutomationFieldsToUserTasks = require('./add-task-automation-fields-to-user-tasks');
const addMetadataToUserTasks = require('./add-metadata-to-user-tasks');
const addStartDateToUserTasks = require('./add-startDate-to-user-tasks');
const addShopIdToUserTasks = require('./add-shop-id-to-user-tasks');
const createTenantAccessAudits = require('./create-tenant-access-audits');
const createAutomationsTables = require('./create-automations-tables');
const backfillTenantBusinessClassificationDefaults = require('./backfill-tenant-business-classification-defaults');
const addDeliveryStatusToJobsAndSales = require('./add-delivery-status-to-jobs-and-sales');
const addDeliveryRequiredToJobs = require('./add-delivery-required-to-jobs');
const addSalesTenantSoldByCreatedIndex = require('./add-sales-tenant-soldby-created-index');
const addQueryPathIndexesV2 = require('./add-query-path-indexes-v2');
const addRecommendedQueryIndexes = require('./add-recommended-query-indexes');
const createRecurringJournals = require('./create-recurring-journals');
const { createCustomerFeedbackTable } = require('./create-customer-feedback-table');
const createStudioLocations = require('./create-studio-locations');
const addPaystackSubaccountToTenants = require('./add-paystack-subaccount-to-tenants');
const addSeedingFlagsToTenants = require('./add-seeding-flags-to-tenants');
const addInvoiceSourceTypes = require('./add-invoice-source-types');
const addQuoteToInvoiceSourceTypeEnum = require('./add-quote-to-invoice-source-type-enum');
const normalizeStudioLocationEmptyCodes = require('./normalize-studio-location-empty-codes');
const addIsDefaultToShops = require('./add-isDefault-to-shops');
const createUserShops = require('./create-user-shops');
const addInviteShopStudioMetadata = require('./add-invite-shop-studio-metadata');
const addShopIdToCustomers = require('./add-shop-id-to-customers');
const addShopTypeToShops = require('./add-shop-type-to-shops');
const addStudioTypeToStudioLocations = require('./add-studio-type-to-studio-locations');
const addShopIdToExpenses = require('./add-shop-id-to-expenses');
const addShopIdToRetailEntities = require('./add-shop-id-to-retail-entities');
const addStudioLocationIdToLeads = require('./add-studio-location-id-to-leads');
const addShopIdToLeads = require('./add-shop-id-to-leads');
const addStudioLocationIdToOperationalModules = require('./add-studio-location-id-to-operational-modules');
const addPaymentTokenToInvoices = require('./add-payment-token-to-invoices');
const addAdminLeadIdToJobs = require('./add-admin-lead-id-to-jobs');
const createSaleActivitiesTable = require('./create-sale-activities-table');
const createProductStockMovementsTable = require('./create-product-stock-movements-table');
const createProductShopStocksAndExpandMovements = require('./create-product-shop-stocks-and-expand-movements');
const addEvatComplianceFields = require('./add-evat-compliance-fields');
const createExpenseActivitiesTable = require('./create-expense-activities-table');
const createCustomerActivitiesTable = require('./create-customer-activities-table');
const createEquipmentTables = require('./create-equipment-tables');
const seedDefaultEquipmentCategories = require('./seed-default-equipment-categories');
const addCommunicationConsentAndWhatsAppEvents = require('./add-communication-consent-and-whatsapp-events');
const addCustomerDateOfBirth = require('./add-customer-date-of-birth');
const createMarketingCampaigns = require('./create-marketing-campaigns');
const addDriverRoleToUserAndInviteEnums = require('./add-driver-role-to-user-and-invite-enums');
const addDeliveryAssignmentFields = require('./add-delivery-assignment-fields');
const backfillJobInvoiceStudioLocations = require('./backfill-job-invoice-studio-locations');
const createSubscriptionPaymentsTable = require('./create-subscription-payments-table');
const backfillTrialPlanDefaults = require('./backfill-trial-plan-defaults');
const createSubscriptionPlansTable = require('./create-subscription-plans-table');
const updateEnterprisePlanLimitsCopy = require('./update-enterprise-plan-limits-copy');
const createOnlineStoreTables = require('./create-online-store-tables');
const addOnlineStoreOrderIndexes = require('./add-online-store-order-indexes');
const createStockTransfers = require('./create-stock-transfers');
const createStorefrontCustomers = require('./create-storefront-customers');
const backfillStorefrontCustomersActiveUnverified = require('./backfill-storefront-customers-active-unverified');
const createMarketplaceTradeAssurance = require('./create-marketplace-trade-assurance');
const createStorefrontWishlistItems = require('./create-storefront-wishlist-items');
const createStorefrontReviews = require('./create-storefront-reviews');
const createOnlineServiceListings = require('./create-online-service-listings');
const extendStorefrontReviewsForServices = require('./extend-storefront-reviews-for-services');
const addMetadataToJobs = require('./add-metadata-to-jobs');
const createDealersAccountTables = require('./create-dealers-account-tables');
const addShopIdToDealers = require('./add-shop-id-to-dealers');
const makeDealersTenantWide = require('./make-dealers-tenant-wide');
const createTenantPlatformSmsUsage = require('./create-tenant-platform-sms-usage');
const addPlatformSmsSettings = require('./add-platform-sms-settings');
const addBranchFieldsToAutomationRules = require('./add-branch-fields-to-automation-rules');
const addCustomDomainToOnlineStoreSettings = require('./add-custom-domain-to-online-store-settings');
const addSoftDeleteFieldsToSales = require('./add-soft-delete-fields-to-sales');
const addReceiptSentToSaleActivitiesType = require('./add-receipt-sent-to-sale-activities-type');
const createSalesAgentTables = require('./create-sales-agent-tables');

const migrate = async () => {
  try {
    console.log('🔄 Starting database migration...\n');
    
    // Test database connection
    await testConnection();
    
    // Update job status enum values (safe if enum doesn't exist yet)
    await updateJobStatuses();
    
    // Skip sequelize.sync() - it generates invalid PostgreSQL ALTERs (ENUM+comment,
    // unique-in-TYPE). Rely on explicit migrations below. For new DBs, run schema
    // creation (e.g. create-tenants-schema, create-inventory-tables) first.

    // Add new user fields if they don't exist
    await addUserFields();
    
    // Ensure user/invite role enums include driver
    await addDriverRoleToUserAndInviteEnums({ closeConnection: false });
    
    // Update vendor price list imageUrl to TEXT
    await updateVendorPriceListImageUrl();
    
    // Update file storage columns to TEXT
    await updateFileStorageToText();
    
    // Add createdBy column to leads table if it doesn't exist
    await addCreatedByToLeads();
    
    // Add isArchived column to expenses table if it doesn't exist
    await addIsArchivedToExpenses();
    
    // Make expenseNumber unique per tenant (not globally)
    await fixExpenseNumberUniqueConstraint();
    
    // Add performance indexes for query optimization
    await addPerformanceIndexes();
    await addNotificationsPerformanceIndexes();
    
    // Add imageUrl column to products table if it doesn't exist
    await addImageUrlToProducts();

    // Alter products.imageUrl to TEXT (for base64 in serverless)
    await alterProductsImageUrlToText();

    // Add trackStock column for made-to-order products
    await addTrackStockToProducts();

    // Add orderStatus column for restaurant order tracking
    await addOrderStatusToSales();

    // POS custom items and delivery fee checkout fields
    await allowNullProductIdOnSaleItems();
    await addDeliveryFeeFieldsToSales();

    // Add clientId column for offline sale idempotency (safe if already exists)
    await addClientIdToSales();

    // Create product_categories, migrate product refs from inventory_categories, switch FK
    await createProductCategoriesAndSwitchProducts();
    
    // Add businessType and studioType to product_categories
    await addBusinessTypeToProductCategories({ closeConnection: false });

    // Add shopType to product_categories
    await addShopTypeToProductCategories({ closeConnection: false });

    // Seed default product categories for all tenants
    await seedDefaultProductCategories({ closeConnection: false });

    // Email case-insensitivity and global uniqueness for email/phone
    await addEmailPhoneUniqueConstraints();

    // Change global unique constraints to per-tenant (email/phone, invoiceNumber, quoteNumber, barcode, sku)
    await fixUniquenessPerTenant();

    // Rename inventory_* tables to materials_* for full materials/equipment consistency
    await renameInventoryTablesToMaterials.up();

    // Equipment categories + equipment items (required for /api/equipment/*)
    await createEquipmentTables();
    await seedDefaultEquipmentCategories({ closeConnection: false });

    // Add businessType, studioType, shopType to materials_categories (after rename)
    await addBusinessTypeToInventoryCategories({ closeConnection: false });

    // Backfill inventory & product categories for existing tenants (materials + products by business/shop type)
    await backfillCategoriesForExistingTenants({ closeConnection: false });

    // Allow NULL tenantId for platform-wide settings (platform:branding, platform:featureFlags, etc.)
    await allowNullTenantIdInSettings();

    // Create invite_tokens table if it doesn't exist
    await createInviteTokens.up(sequelize.getQueryInterface(), require('sequelize'));

    // Create password_reset_tokens table if it doesn't exist
    await createPasswordResetTokens.up(sequelize.getQueryInterface(), require('sequelize'));

    // Create email_verification_tokens table if it doesn't exist
    await createEmailVerificationTokens.up(sequelize.getQueryInterface(), require('sequelize'));

    // Add email_verified_at to users if it doesn't exist
    await addEmailVerifiedAtToUsers.up();

    // Add partially_paid to sales status enum
    const queryInterface = sequelize.getQueryInterface();
    await addPartiallyPaidToSalesStatus.up(queryInterface);

    // Quote → invoice → sale flow (quoteId on invoices, productId on quote_items)
    await addQuoteInvoiceSaleFlow();

    // Invoice source types (saleId, prescriptionId, sourceType enum)
    await addInvoiceSourceTypes();

    // Quote-sourced invoices (enum_invoices_sourceType + invoice_source_type_enum)
    await addQuoteToInvoiceSourceTypeEnum();

    // Public invoice payment links (paymentToken)
    await addPaymentTokenToInvoices();

    // Platform admin lead link on jobs
    await addAdminLeadIdToJobs();

    // Add viewToken to quotes for public quote viewing
    await addViewTokenToQuotes();

    // Add viewToken to jobs for customer job tracking links
    await addViewTokenToJobs();

    // Add invite email delivery status fields
    await addInviteEmailStatusFields();

    // Per-user notification preference JSON on users
    await addNotificationPreferencesToUsers.up();

    // Quote tax columns (tenant tax configuration)
    await addTaxToQuotes();

    // Jobs list/search indexes
    await addJobQueryIndexes();

    // Workspace tasks (table must exist before column/index migrations)
    await createUserTasksTable();
    await addAssigneeToUserTasks();

    // Workspace task automation metadata columns
    await addTaskAutomationFieldsToUserTasks();
    await addMetadataToUserTasks.up();
    await addStartDateToUserTasks.up();

    // Tenant access audit trail
    await createTenantAccessAudits.up();

    const createSupportTicketsAndSessions = require('./create-support-tickets-and-sessions');
    await createSupportTicketsAndSessions.up();

    const addSupportPermissions = require('./add-support-permissions');
    await addSupportPermissions();

    const addAutomationsPermission = require('./add-automations-permission-to-platform-admin');
    await addAutomationsPermission();

    // Automations V1 tables
    await createAutomationsTables.up({ closeConnection: false });

    // Delayed event-driven automation runs (Send after / delayMinutes)
    const createAutomationDelayedRuns = require('./create-automation-delayed-runs');
    await createAutomationDelayedRuns.up({ closeConnection: false });

    // Customer communication consent and WhatsApp webhook/send event history
    await addCommunicationConsentAndWhatsAppEvents.up({ closeConnection: false });

    // Customer date of birth for birthday automations
    await addCustomerDateOfBirth.up({ closeConnection: false });

    // Persisted marketing campaigns and broadcast history
    await createMarketingCampaigns.up({ closeConnection: false });

    // Default missing tenant business/shop/studio classification fields
    await backfillTenantBusinessClassificationDefaults({ closeConnection: false });

    // First-party delivery tracking (jobs + sales)
    await addDeliveryStatusToJobsAndSales();
    await addDeliveryAssignmentFields({ closeConnection: false });

    // Sale activity log (notes, status changes, payments on sales)
    await createSaleActivitiesTable();

    // Product stock movement ledger (receive / adjust / transfer)
    await createProductStockMovementsTable();

    // Per-shop stock balances + expanded movement types + backfill
    await createProductShopStocksAndExpandMovements();

    // GRA e-VAT: invoice.metadata + customer ghanaCardPin
    await addEvatComplianceFields({ closeConnection: false });

    // Expense activity log (notes, approvals, payments on expenses)
    await createExpenseActivitiesTable();

    // Customer activity log (notes, calls, follow-ups on customers)
    await createCustomerActivitiesTable();

    // Job flag: customer delivery required (vs optional); stages still set on Deliveries
    await addDeliveryRequiredToJobs();

    // Sales list for staff (tenant + soldBy + recency)
    await addSalesTenantSoldByCreatedIndex();

    // Additional endpoint-driven indexes (sales/invoices/jobs)
    await addQueryPathIndexesV2();

    // Recurring journals and prepaid expense schedules
    await createRecurringJournals({ closeConnection: false });

    // Studio locations (multi-branch for studio workspaces)
    await createStudioLocations();

    // Blank codes ('') break partial unique index; normalize before edits
    await normalizeStudioLocationEmptyCodes();

    // End-customer feedback (public form submissions per tenant; needs studio_locations FK)
    await createCustomerFeedbackTable();

    // studioLocationId on expenses, tasks, materials, equipment (not customer_feedback)
    await addStudioLocationIdToOperationalModules();
    await backfillJobInvoiceStudioLocations({ closeConnection: false });

    // Main shop flag (multi-shop for retail workspaces)
    await addIsDefaultToShops();

    // User ↔ shop access (team invites and assignments)
    await createUserShops();
    await addShopIdToUserTasks();

    // Invite metadata (shopIds, studioLocationIds) + backfill assignments from accepted invites
    await addInviteShopStudioMetadata();

    // Customers scoped to shops; per-shop retail type (supermarket, hardware, etc.)
    await addShopIdToCustomers();
    await addShopTypeToShops();
    await addStudioTypeToStudioLocations();
    await addShopIdToExpenses();
    await addShopIdToRetailEntities();
    await addRecommendedQueryIndexes({ closeConnection: false });

    // Inter-shop stock transfers (products table + transfer audit log)
    await createStockTransfers();

    // Leads scoped to studio locations (multi-branch studio workspaces)
    await addStudioLocationIdToLeads();
    await addShopIdToLeads();

    // Customer email/phone unique per studio/shop branch (tenant-wide when unscoped)
    const fixCustomerUniquenessPerScope = require('./fix-customer-uniqueness-per-scope');
    await fixCustomerUniquenessPerScope();

    const addBranchBrandingFields = require('./add-branch-branding-fields');
    await addBranchBrandingFields();

    // Paystack subaccount code per tenant (POS payment splits)
    await addPaystackSubaccountToTenants.up();

    // Category/account/equipment seeding status flags
    await addSeedingFlagsToTenants.up();

    // SaaS subscription plan catalog + payment ledger
    await createSubscriptionPlansTable.up();
    await createSubscriptionPaymentsTable({ closeConnection: false });
    await backfillTrialPlanDefaults.up({ closeConnection: false });
    await updateEnterprisePlanLimitsCopy();
    await createOnlineStoreTables.up({ closeConnection: false });
    await createStorefrontCustomers({ closeConnection: false });
    await backfillStorefrontCustomersActiveUnverified({ closeConnection: false });
    await addOnlineStoreOrderIndexes({ closeConnection: false });
    await createMarketplaceTradeAssurance.up({ closeConnection: false });
    await createStorefrontWishlistItems.up({ closeConnection: false });
    await createStorefrontReviews.up({ closeConnection: false });
    await createOnlineServiceListings.up({ closeConnection: false });
    await extendStorefrontReviewsForServices.up({ closeConnection: false });
    await addMetadataToJobs.up();
    await createDealersAccountTables.up({ closeConnection: false });
    await addShopIdToDealers({ closeConnection: false });
    await makeDealersTenantWide({ closeConnection: false });

    const addWholesalePriceToProducts = require('./add-wholesale-price-to-products');
    await addWholesalePriceToProducts({ closeConnection: false });

    await createTenantPlatformSmsUsage.up({ closeConnection: false });
    await addPlatformSmsSettings.up({ closeConnection: false });

    // Branch-specific automations: null shopId/studioLocationId = applies to all branches
    await addBranchFieldsToAutomationRules();

    // "Online Store" custom domain product (customer-owned domain -> single-store template)
    await addCustomDomainToOnlineStoreSettings();

    // Online Store selectable visual templates (classic / minimal / bold / …)
    const addTemplateIdToOnlineStoreSettings = require('./add-templateId-to-online-store-settings');
    await addTemplateIdToOnlineStoreSettings({ closeConnection: false });

    // Template-driven secondary / tertiary brand colors
    const addSecondaryTertiaryColorsToOnlineStoreSettings = require('./add-secondary-tertiary-colors-to-online-store-settings');
    await addSecondaryTertiaryColorsToOnlineStoreSettings({ closeConnection: false });

    // Sale soft-delete audit trail (manager/staff soft-delete paid sales with a reason)
    await addSoftDeleteFieldsToSales();

    // Receipt send activity type (SMS/email/WhatsApp receipt logging)
    await addReceiptSentToSaleActivitiesType.up();

    // POS refunds & exchanges (SaleReturn + line items; separate from marketplace Trade Assurance)
    const createSaleReturnsTables = require('./create-sale-returns-tables');
    await createSaleReturnsTables();

    // Sales agent growth: agents, codes, tenant attribution, commission ledger
    await createSalesAgentTables({ closeConnection: false });

    // Sabito Partner Program (marketers, partnerships, commissions)
    const createPartnerProgramTables = require('./create-partner-program-tables');
    await createPartnerProgramTables({ closeConnection: false });

    // Sabito marketer referrals + cashout ledger
    const createPartnerReferralCashoutTables = require('./create-partner-referral-cashout-tables');
    await createPartnerReferralCashoutTables({ closeConnection: false });

    // Online Store hero library (categories / designs / colorways + heroSlides)
    const createOnlineStoreHeroLibraryTables = require('./create-online-store-hero-library-tables');
    await createOnlineStoreHeroLibraryTables({ closeConnection: false });

    // Sabito marketplace listing flag (independent of Online Store enabled)
    const addListedOnMarketplaceToOnlineStoreSettings = require('./add-listed-on-marketplace-to-online-store-settings');
    await addListedOnMarketplaceToOnlineStoreSettings({ closeConnection: false });

    // Account balances must be unique per (tenantId, accountId, fiscalYear, period)
    // Fixes UniqueConstraintError when posting journals across months
    const fixAccountBalancesUniqueConstraint = require('./fix-account-balances-unique-constraint');
    await fixAccountBalancesUniqueConstraint({ closeConnection: false });

    // Quote file attachments (proposal / requirements / agreement docs)
    await addAttachmentsToQuotes();

    // Studio quotation PDF fields (payment schedule, scope, terms, acceptance)
    await addStudioQuotationFieldsToQuotes();

    // Platform System Health: delivery_events + system_health_issues
    const createSystemHealthTables = require('./create-system-health-tables');
    await createSystemHealthTables({ closeConnection: false });

    // Platform IT Ops vault (domains / servers / services) + ops.view permission
    const createPlatformOpsAssets = require('./create-platform-ops-assets');
    await createPlatformOpsAssets({ closeConnection: false });

    const addCustomerIdToPlatformOpsAssets = require('./add-customer-id-to-platform-ops-assets');
    await addCustomerIdToPlatformOpsAssets({ closeConnection: false });

    console.log('\n✅ Database migration completed successfully!');
    console.log('📊 Incremental schema updates applied.');
    console.log('👤 User model has been enhanced with new fields.');
    console.log('🎫 Invite tokens table ready.');
    console.log('⚡ Performance indexes created.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
};

migrate();

