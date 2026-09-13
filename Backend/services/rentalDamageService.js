const { DamageReport, Expense } = require('../models');

const autoCreateExpenseFromDamage = async ({ damageReportId, tenantId, shopId, createdBy, productName }) => {
  const damageReport = await DamageReport.findByPk(damageReportId);

  if (!damageReport) {
    throw new Error('Damage report not found');
  }

  const expenseNumber = `EXP-DMG-${Date.now()}`;
  const expense = await Expense.create({
    tenantId,
    shopId,
    expenseNumber,
    category: 'Rental Damage',
    description: `${damageReport.damageType || 'Damage'} on ${productName || 'rental item'} - Damage Report ${damageReport.id}`,
    amount: Number(damageReport.estimatedRepairCost || 0),
    expenseDate: new Date(),
    paymentMethod: 'other',
    status: 'pending',
    approvalStatus: 'pending_approval',
    submittedBy: createdBy,
    damageReportId: damageReport.id,
    notes: [
      damageReport.description || 'Rental damage expense generated from damage report',
      `Rental ID: ${damageReport.rentalId}`,
      `Severity: ${damageReport.severity || 'minor'}`,
    ].filter(Boolean).join('\n'),
  });

  await damageReport.update({
    expenseId: expense.id,
    status: 'pending_approval'
  });

  return expense;
};

module.exports = {
  autoCreateExpenseFromDamage
};
