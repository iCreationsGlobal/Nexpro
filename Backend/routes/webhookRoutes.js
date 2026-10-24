const express = require('express');
const router = express.Router();
const {
  handleSabitoCustomerWebhook,
  handleWhatsAppWebhook,
  handlePaystackWebhook,
} = require('../controllers/webhookController');
const { mtnWebhook, airtelWebhook, hubtelWebhook } = require('../controllers/mobileMoneyController');
const { lynkImportCheck, lynkImportFinished } = require('../controllers/lynkImportController');
const { lynkAsk } = require('../controllers/lynkAiController');

// Sabito webhook endpoint (no auth middleware - uses API key authentication)
router.post('/sabito/customer', handleSabitoCustomerWebhook);

// WhatsApp webhook endpoint (no auth middleware - uses signature verification)
router.get('/whatsapp', handleWhatsAppWebhook);
router.post('/whatsapp', handleWhatsAppWebhook);

// Mobile Money webhooks (no auth - provider verifies via signature/IP)
router.post('/mtn-momo', mtnWebhook);
router.post('/airtel-money', airtelWebhook);
router.post('/hubtel', hubtelWebhook);

// Paystack (subscriptions, invoices, POS)
router.post('/paystack', handlePaystackWebhook);

// Lynk AI product import (signed by Lynk: controllers/lynkImportController.js)
router.post('/lynk/import-check', lynkImportCheck);
router.post('/lynk/import-finished', lynkImportFinished);
// Lynk AI asks about the business (signed: controllers/lynkAiController.js)
router.post('/lynk/ask', lynkAsk);

module.exports = router;






