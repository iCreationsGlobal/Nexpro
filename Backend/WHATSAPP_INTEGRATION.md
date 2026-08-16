# WhatsApp Business API Integration Guide

This document provides setup instructions and usage guide for the WhatsApp Business API integration.

## Overview

The WhatsApp integration allows businesses to send automated notifications to customers via WhatsApp, including:
- Invoice notifications with payment links
- Quote/proposal delivery
- Order/job confirmations
- Payment reminders for overdue invoices
- Low stock alerts for shop products

## Prerequisites

1. **Meta Business Account**: You need a Meta Business Account
2. **WhatsApp Business API Access**: Apply for WhatsApp Business API access through Meta
3. **Phone Number**: A verified phone number for your business
4. **App Setup**: Create a WhatsApp App in Meta for Developers

## Setup Instructions

### Step 1: Create WhatsApp App in Meta for Developers

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app or select an existing one
3. Add "WhatsApp" product to your app
4. Complete the business verification process

### Step 2: Get Required Credentials

From your Meta Business Manager, you'll need:

1. **Phone Number ID**: Found in WhatsApp > API Setup
2. **Access Token**: Generate a temporary or permanent token
3. **Business Account ID**: Your Meta Business Account ID
4. **App Secret**: For webhook signature verification (optional but recommended)

### Step 3: Configure Webhook

1. In Meta for Developers, go to WhatsApp > Configuration
2. Set Webhook URL: `https://your-backend-domain.com/api/webhooks/whatsapp`
3. Set Verify Token: Create a secure random string
4. Subscribe to webhook fields:
   - `messages` - For incoming messages (future use)
   - `message_status` - For delivery status updates

### Step 4: Create Message Templates

You need to create and approve the following templates in Meta Business Manager:

#### 1. invoice_notification
- **Language**: English
- **Category**: UTILITY
- **Body**: `Hello {{1}}, your invoice {{2}} for {{3}} is ready. Pay online: {{4}}`
- **Parameters**: 
  - {{1}} - Customer name
  - {{2}} - Invoice number
  - {{3}} - Amount
  - {{4}} - Payment link

#### 2. quote_delivery
- **Language**: English
- **Category**: UTILITY
- **Body**: `Hi {{1}}, your quote {{2}} for {{3}} is ready. View here: {{4}}`
- **Parameters**:
  - {{1}} - Customer name
  - {{2}} - Quote number
  - {{3}} - Quote title
  - {{4}} - Quote link

#### 3. order_confirmation
- **Language**: English
- **Category**: UTILITY
- **Body**: `Thank you {{1}}! Your order {{2}} has been confirmed. We'll notify you when it's ready.`
- **Parameters**:
  - {{1}} - Customer name
  - {{2}} - Order number

#### 4. payment_reminder
- **Language**: English
- **Category**: UTILITY
- **Body**: `Reminder: Invoice {{1}} for {{2}} is overdue. Please pay: {{3}}`
- **Parameters**:
  - {{1}} - Invoice number
  - {{2}} - Amount
  - {{3}} - Payment link

#### 5. low_stock_alert
- **Language**: English
- **Category**: UTILITY
- **Body**: `Alert: {{1}} is running low. Current stock: {{2}}, Reorder level: {{3}}`
- **Parameters**:
  - {{1}} - Product name
  - {{2}} - Current stock
  - {{3}} - Reorder level

**Note**: Template approval can take 24-48 hours. You can only send messages using approved templates.

### Step 5: Configure in Application

1. Go to Settings > WhatsApp in your application
2. Enter your credentials:
   - Phone Number ID
   - Access Token
   - Business Account ID (optional)
   - Webhook Verify Token
   - Template Namespace (optional)
3. Click "Test Connection" to verify
4. Enable WhatsApp notifications

## Environment Variables

Add to your `.env` file:

```env
# WhatsApp Business API (Meta)
WHATSAPP_CREDENTIALS_ENCRYPTION_KEY=your_64_hex_char_key
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token
WHATSAPP_APP_SECRET=your_app_secret  # For webhook signature verification
WHATSAPP_API_VERSION=v21.0
API_PUBLIC_URL=https://your-backend-domain.com
```

## Usage

### Automatic Notifications

Once configured, WhatsApp notifications are sent automatically when:

1. **Invoice Sent**: When you send an invoice to a customer
2. **Quote Created**: When a new quote is created for a customer
3. **Order Confirmed**: When a job status changes to "in_progress"
4. **Payment Reminder**: Daily at 9 AM for overdue invoices
5. **Low Stock Alert**: When product quantity falls below reorder level

### Phone Number Format

Phone numbers are automatically formatted to E.164 format:
- Ghana: +233XXXXXXXXX
- Nigeria: +234XXXXXXXXXX
- Kenya: +254XXXXXXXXX
- Other countries: +[country code][number]

The system handles:
- Numbers with leading zeros
- Numbers with country codes
- Numbers with + prefix
- Local formatting

## Rate Limits

Meta WhatsApp Business API has rate limits:
- **1000 conversations per day** (free tier)
- **Unlimited conversations** (paid tier)

The system includes built-in rate limiting to respect these limits.

## Webhook Configuration

### Webhook URL
```
https://your-backend-domain.com/api/webhooks/whatsapp
```

### Webhook Events Handled

1. **Message Status Updates**: Tracks when messages are sent, delivered, read, or failed
2. **Incoming Messages**: Ready for future two-way messaging support

### Webhook Verification

Meta will send a GET request to verify your webhook:
- **hub.mode**: `subscribe`
- **hub.verify_token**: Your verify token
- **hub.challenge**: Random string to echo back

## Troubleshooting

### Messages Not Sending

1. **Check Configuration**: Verify all credentials are correct
2. **Test Connection**: Use the "Test Connection" button in settings
3. **Check Templates**: Ensure templates are approved in Meta
4. **Check Phone Numbers**: Verify customer phone numbers are valid
5. **Check Rate Limits**: Ensure you haven't exceeded daily limits
6. **Check Logs**: Review server logs for error messages

### Common Errors

- **Invalid Phone Number**: Phone number must be in E.164 format
- **Template Not Found**: Template must be created and approved in Meta
- **Rate Limit Exceeded**: Wait 24 hours or upgrade your Meta plan
- **Access Token Expired**: Generate a new access token

### Testing

1. Use Meta's test numbers for development
2. Test with your own WhatsApp number first
3. Verify webhook is receiving events
4. Check message delivery status in logs

## Security Best Practices

1. **Encrypt Access Tokens**: Store access tokens securely (consider encryption)
2. **Use Webhook Verification**: Always verify webhook signatures
3. **Rate Limiting**: Respect Meta's rate limits
4. **Customer Consent**: Ensure customers have opted in to WhatsApp messages
5. **Privacy**: Don't log full phone numbers in production

## API Endpoints

### Backend Endpoints

- `GET /api/settings/whatsapp` - Get WhatsApp settings
- `PUT /api/settings/whatsapp` - Update WhatsApp settings
- `POST /api/settings/whatsapp/test` - Test connection
- `GET /api/webhooks/whatsapp` - Webhook verification
- `POST /api/webhooks/whatsapp` - Webhook events

### Frontend

- Settings page: `/settings/whatsapp`

## Message Templates Reference

Create UTILITY templates in Meta with these exact names (language `en`). Automations prefill the matching template when you add a WhatsApp action.

| Template | Used for |
|----------|----------|
| invoice_notification | Invoice sent / high-value invoice |
| quote_delivery | Quote sent |
| quote_follow_up | Quote with no response |
| order_confirmation | Job/order confirmed |
| order_created | Order created |
| sale_receipt | POS sale completed |
| payment_reminder | Overdue invoice |
| payment_received | Payment recorded |
| review_request | Review request |
| job_completed | Job completed |
| birthday_greeting | Customer birthday |
| win_back | Inactive customers |
| low_stock_alert | Low stock |
| welcome_customer | New customer |
| new_lead_alert | New lead |
| lead_follow_up | Lead with no contact |
| prescription_refill | Pharmacy refill due |
| low_profit_alert | Low margin sale |
| daily_sales_summary | Daily sales recap |

All templates use the `en` language code. To support other languages (French, Swahili, etc.), create additional templates with different language codes.

## Future Enhancements

1. Two-way messaging for customer support
2. Interactive buttons in messages
3. Multi-language template support
4. Message analytics dashboard
5. Template management UI
6. Customer opt-in/opt-out management

## Support

For issues with:
- **Meta WhatsApp API**: Contact Meta Business Support
- **Application Integration**: Check application logs and error messages
- **Template Approval**: Template approval is handled by Meta (24-48 hours)

## Additional Resources

- [Meta WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp)
- [WhatsApp Business API Setup Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- [Message Templates Guide](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)
