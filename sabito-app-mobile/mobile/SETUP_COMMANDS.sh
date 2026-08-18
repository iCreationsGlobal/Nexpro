#!/bin/bash

# ========================================
# Sabito Mobile App - EAS Setup Commands
# ========================================
# 
# This script contains all the commands to set up EAS secrets
# for your production build.
#
# HOW TO USE:
# 1. Replace all the placeholder values with your real values
# 2. Run this script: bash SETUP_COMMANDS.sh
# 3. Or copy-paste commands one by one into your terminal
#
# ========================================

echo "🚀 Setting up Sabito Mobile App production secrets..."
echo ""

# ========================================
# STEP 1: API Configuration
# ========================================
echo "📡 Setting up API configuration..."

eas secret:create --scope project --name PROD_API_URL \
  --value "https://api.sabito.com"

eas secret:create --scope project --name PROD_SUPPORT_URL \
  --value "https://sabito.com/api/support/support-content.json"

echo "✅ API configuration complete"
echo ""

# ========================================
# STEP 2: Payment Integration (Paystack)
# ========================================
echo "💳 Setting up Paystack..."

# IMPORTANT: Get your LIVE key from https://dashboard.paystack.com/
eas secret:create --scope project --name PROD_PAYSTACK_KEY \
  --value "pk_live_REPLACE_WITH_YOUR_REAL_PAYSTACK_LIVE_KEY"

echo "✅ Paystack configuration complete"
echo ""

# ========================================
# STEP 3: Google OAuth
# ========================================
echo "🔐 Setting up Google OAuth..."

# Get these from Google Cloud Console: https://console.cloud.google.com/
eas secret:create --scope project --name PROD_GOOGLE_IOS \
  --value "REPLACE_WITH_YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"

eas secret:create --scope project --name PROD_GOOGLE_ANDROID \
  --value "REPLACE_WITH_YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com"

eas secret:create --scope project --name PROD_GOOGLE_WEB \
  --value "REPLACE_WITH_YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"

echo "✅ Google OAuth configuration complete"
echo ""

# ========================================
# VERIFICATION
# ========================================
echo "🔍 Verifying secrets..."
echo ""
eas secret:list

echo ""
echo "✅ All secrets configured!"
echo ""
echo "📋 Next steps:"
echo "1. Verify all secrets are correct: eas secret:list"
echo "2. Build development version: eas build --profile development --platform android"
echo "3. Build production version: eas build --profile production --platform all"
echo ""
echo "📖 See PRODUCTION_GUIDE.md for detailed instructions"

