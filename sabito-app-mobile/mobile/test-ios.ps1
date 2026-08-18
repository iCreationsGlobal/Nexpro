# iOS Testing Quick Start Script for Windows
# This script helps you test the Sabito app on iOS devices

Write-Host "📱 Sabito iOS Testing Setup" -ForegroundColor Cyan
Write-Host "==============================`n" -ForegroundColor Cyan

# Check if we're in the mobile directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Please run this script from the mobile directory" -ForegroundColor Red
    Write-Host "   cd mobile" -ForegroundColor Yellow
    exit 1
}

# Check if Expo is installed
Write-Host "🔍 Checking Expo installation..." -ForegroundColor Yellow
try {
    $expoVersion = npx expo --version 2>&1
    Write-Host "✅ Expo found: $expoVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Expo not found. Installing..." -ForegroundColor Red
    npm install -g expo-cli
}

# Get local IP address
Write-Host "`n🌐 Getting your local IP address..." -ForegroundColor Yellow
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" } | Select-Object -First 1).IPAddress

if ($ipAddress) {
    Write-Host "✅ Your IP: $ipAddress" -ForegroundColor Green
    Write-Host "   Use this in Expo Go: exp://$ipAddress`:8081" -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Could not detect IP address" -ForegroundColor Yellow
    Write-Host "   You may need to enter it manually in Expo Go" -ForegroundColor Yellow
}

# Check if .env file exists
Write-Host "`n🔍 Checking environment configuration..." -ForegroundColor Yellow
if (Test-Path ".env.development") {
    Write-Host "✅ .env.development found" -ForegroundColor Green
} else {
    Write-Host "⚠️  .env.development not found" -ForegroundColor Yellow
    Write-Host "   Copy .env.example to .env.development and configure it" -ForegroundColor Yellow
}

# Display testing options
Write-Host "`n📋 Testing Options:" -ForegroundColor Cyan
Write-Host "==================`n" -ForegroundColor Cyan

Write-Host "Option 1: Expo Go (Recommended for Development)" -ForegroundColor Green
Write-Host "  1. Install 'Expo Go' from App Store on your iPhone" -ForegroundColor White
Write-Host "  2. Run: npx expo start" -ForegroundColor Yellow
Write-Host "  3. Scan QR code with iPhone Camera app" -ForegroundColor White
Write-Host "  4. Or enter URL in Expo Go: exp://$ipAddress`:8081`n" -ForegroundColor White

Write-Host "Option 2: Development Build (For Production Testing)" -ForegroundColor Green
Write-Host "  1. Install EAS CLI: npm install -g eas-cli" -ForegroundColor Yellow
Write-Host "  2. Login: eas login" -ForegroundColor Yellow
Write-Host "  3. Build: eas build --profile development --platform ios" -ForegroundColor Yellow
Write-Host "  4. Install on device and connect to dev server`n" -ForegroundColor White

Write-Host "Option 3: Tunnel Mode (If local network doesn't work)" -ForegroundColor Green
Write-Host "  Run: npx expo start --tunnel" -ForegroundColor Yellow
Write-Host "  (Slower but works across different networks)`n" -ForegroundColor White

# Ask user what they want to do
Write-Host "`n🚀 What would you like to do?" -ForegroundColor Cyan
Write-Host "  1) Start Expo (Expo Go)" -ForegroundColor White
Write-Host "  2) Start Expo with Tunnel" -ForegroundColor White
Write-Host "  3) Start Expo for Development Build" -ForegroundColor White
Write-Host "  4) Check EAS Build status" -ForegroundColor White
Write-Host "  5) Exit" -ForegroundColor White

$choice = Read-Host "`nEnter choice (1-5)"

switch ($choice) {
    "1" {
        Write-Host "`n🚀 Starting Expo..." -ForegroundColor Green
        Write-Host "   Scan QR code with iPhone Camera app`n" -ForegroundColor Yellow
        npx expo start
    }
    "2" {
        Write-Host "`n🚀 Starting Expo with Tunnel..." -ForegroundColor Green
        Write-Host "   This may take a moment...`n" -ForegroundColor Yellow
        npx expo start --tunnel
    }
    "3" {
        Write-Host "`n🚀 Starting Expo for Development Build..." -ForegroundColor Green
        npx expo start --dev-client
    }
    "4" {
        Write-Host "`n🔍 Checking EAS Build status..." -ForegroundColor Yellow
        try {
            eas build:list --platform ios --limit 5
        } catch {
            Write-Host "❌ EAS CLI not installed. Install with: npm install -g eas-cli" -ForegroundColor Red
        }
    }
    "5" {
        Write-Host "`n👋 Goodbye!" -ForegroundColor Cyan
        exit 0
    }
    default {
        Write-Host "`n❌ Invalid choice" -ForegroundColor Red
    }
}

Write-Host "`n📖 For more details, see: mobile/IOS_TESTING_GUIDE.md" -ForegroundColor Cyan


