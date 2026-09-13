/** Read structured payout data, with compatibility for the original provider|name format. */
const marketerPayment = (marketer) => {
  const legacy = String(marketer.bankDetails || '').split('|');
  const payment = marketer.metadata?.payment || {};
  return {
    paymentProvider: payment.provider || (legacy.length === 2 ? legacy[0] : null),
    accountName: payment.accountName || (legacy.length === 2 ? legacy[1] : null),
    paymentNumber: marketer.momoNumber || null,
    paymentMethod: marketer.momoNumber ? 'mobile_money' : marketer.bankDetails ? 'bank' : null,
  };
};
module.exports = marketerPayment;
