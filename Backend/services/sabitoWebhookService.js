const axios = require('axios');
const { OnlineStoreSettings } = require('../models');

class SabitoWebhookService {
  constructor() {
    // Sabito API/Backend URL (for sending webhooks)
    this.baseUrl = process.env.SABITO_API_URL || 'http://localhost:4002';
    this.apiKey = process.env.SABITO_API_KEY;
  }

  /**
   * Send invoice webhook to Sabito
   * @param {Object} invoice - Invoice instance
   * @param {Object} customer - Customer instance (with Sabito fields)
   * @param {String} tenantId - Tenant ID
   * @returns {Promise<Object>} - Response from Sabito
   */
  async sendInvoiceWebhook(invoice, customer, tenantId) {
    // Only send if customer has Sabito ID
    if (!customer.sabitoCustomerId) {
      return {
        skipped: true,
        reason: 'Customer not linked to Sabito'
      };
    }

    if (!this.apiKey) {
      console.warn('SABITO_API_KEY not configured, skipping webhook');
      return {
        skipped: true,
        reason: 'Sabito API key not configured'
      };
    }

    try {
      const storeSettings = await OnlineStoreSettings.findOne({
        where: { tenantId },
        attributes: ['currency'],
      });
      const payload = {
        event: 'invoice.created',
        app: 'nexpro',
        businessId: customer.sabitoBusinessId,
        timestamp: new Date().toISOString(),
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: customer.sabitoCustomerId,
          customerEmail: customer.email,
          customerName: customer.name,
          customerPhone: customer.phone,
          amount: parseFloat(invoice.totalAmount),
          currency: storeSettings?.currency || 'GHS',
          status: invoice.status,
          paidAt: invoice.paidDate ? invoice.paidDate.toISOString() : null,
          createdAt: invoice.createdAt.toISOString(),
          items: invoice.items || []
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/api/integrations/webhooks/invoice-created`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'x-tenant-id': tenantId
          },
          timeout: 10000 // 10 second timeout
        }
      );

      return {
        success: true,
        projectId: response.data?.projectId,
        commission: response.data?.commission
      };

    } catch (error) {
      console.error('Sabito webhook error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send invoice paid webhook to Sabito
   * @param {Object} invoice - Invoice instance
   * @param {Object} customer - Customer instance
   * @param {String} tenantId - Tenant ID
   * @returns {Promise<Object>}
   */
  async sendInvoicePaidWebhook(invoice, customer, tenantId) {
    if (!customer.sabitoCustomerId) {
      return { skipped: true };
    }

    if (!this.apiKey) {
      return { skipped: true, reason: 'API key not configured' };
    }

    try {
      const payload = {
        event: 'invoice.updated',
        app: 'nexpro',
        businessId: customer.sabitoBusinessId,
        timestamp: new Date().toISOString(),
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: customer.sabitoCustomerId,
          status: 'paid',
          paidAt: invoice.paidDate.toISOString(),
          amount: parseFloat(invoice.totalAmount)
        }
      };

      await axios.post(
        `${this.baseUrl}/api/integrations/webhooks/invoice-created`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'x-tenant-id': tenantId
          },
          timeout: 10000
        }
      );

      return { success: true };

    } catch (error) {
      console.error('Sabito paid webhook error:', error);
      throw error;
    }
  }
}

module.exports = new SabitoWebhookService();


