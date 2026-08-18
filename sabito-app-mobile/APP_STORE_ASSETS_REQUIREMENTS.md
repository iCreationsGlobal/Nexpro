# 📸 App Store Assets Requirements

Complete checklist of all assets you need to prepare for App Store submission.

---

## 🎯 **Required Assets**

### 1. App Icon
- **Size:** 1024 x 1024 pixels
- **Format:** PNG
- **Requirements:**
  - No transparency
  - No rounded corners (Apple adds them automatically)
  - No alpha channel
  - Square image
  - High quality, sharp edges
- **Location:** `mobile/assets/icon.png`
- **Note:** This is already configured in your `app.json`

---

### 2. App Screenshots

Apple requires screenshots for **all device sizes** your app supports. You need screenshots for:

#### iPhone Screenshots (Required)

**iPhone 6.7" Display** (iPhone 14 Pro Max, iPhone 13 Pro Max, iPhone 12 Pro Max)
- **Size:** 1290 x 2796 pixels
- **Required:** At least 1 screenshot
- **Recommended:** 3-10 screenshots showing key features

**iPhone 6.5" Display** (iPhone 11 Pro Max, iPhone XS Max)
- **Size:** 1242 x 2688 pixels
- **Required:** At least 1 screenshot
- **Recommended:** 3-10 screenshots

**iPhone 5.5" Display** (iPhone 8 Plus, iPhone 7 Plus, iPhone 6s Plus)
- **Size:** 1242 x 2208 pixels
- **Required:** At least 1 screenshot
- **Recommended:** 3-10 screenshots

#### iPad Screenshots (Required if `supportsTablet: true`)

**iPad Pro (12.9")**
- **Size:** 2048 x 2732 pixels
- **Required:** At least 1 screenshot
- **Recommended:** 3-10 screenshots

**iPad Pro (11")**
- **Size:** 1668 x 2388 pixels
- **Required:** At least 1 screenshot
- **Recommended:** 3-10 screenshots

#### Screenshot Guidelines:
- Show your app's key features
- Use real content (not placeholder text)
- No device frames needed (Apple adds them)
- No status bar (will be hidden automatically)
- No watermarks or promotional text
- First screenshot is most important (shown in search results)

---

### 3. App Preview Video (Optional but Recommended)

- **Duration:** 15-30 seconds
- **Format:** MP4 or MOV
- **Size:** Same as screenshot sizes for each device
- **Requirements:**
  - Show app in action
  - No sound (or muted)
  - No text overlays
  - Smooth, professional quality
- **Benefits:** Can significantly increase downloads

---

## 📝 **Text Content**

### 1. App Name
- **Current:** Sabito
- **Max Length:** 30 characters
- **Note:** Already set in `app.json`

### 2. Subtitle
- **Max Length:** 30 characters
- **Example:** "Connect businesses with marketers"
- **Purpose:** Shown below app name in App Store

### 3. Description
- **Max Length:** 4000 characters
- **First 3 lines:** Most important (shown in search results)
- **Requirements:**
  - Clear, compelling description
  - Highlight key features
  - Include keywords naturally
  - No HTML tags
  - No emojis in first line
- **Example Structure:**
  ```
  Sabito connects businesses with professional marketers to drive growth.
  
  Key Features:
  • Find verified marketers for your business
  • Real-time chat and communication
  • Secure payment processing
  • Business profile management
  • AI-powered matching
  
  Whether you're a business owner looking for marketing expertise or a marketer seeking opportunities, Sabito makes it easy to connect and collaborate.
  ```

### 4. Keywords
- **Max Length:** 100 characters
- **Format:** Comma-separated, no spaces after commas
- **Example:** `business,marketing,networking,professional,marketer,advertising`
- **Tips:**
  - Use relevant keywords
  - Don't repeat words
  - Research competitor keywords
  - Include variations

### 5. Promotional Text (Optional)
- **Max Length:** 170 characters
- **Purpose:** Can be updated without app review
- **Use:** For promotions, updates, special offers

### 6. What's New (For Updates)
- **Max Length:** 4000 characters
- **Purpose:** Describe changes in new version
- **Required:** For app updates

---

## 🔗 **URLs (All Required)**

### 1. Privacy Policy URL
- **Required:** Yes
- **Format:** Full URL (e.g., `https://sabito.com/privacy`)
- **Requirements:**
  - Must be accessible
  - Must explain what data you collect
  - Must explain how you use data
  - Must be in same language as app
- **Note:** Apple will reject your app without this

### 2. Support URL
- **Required:** Yes
- **Format:** Full URL (e.g., `https://sabito.com/support`)
- **Requirements:**
  - Must be accessible
  - Should provide customer support information
  - Can be same as marketing URL if you don't have separate support page

### 3. Marketing URL (Optional)
- **Format:** Full URL (e.g., `https://sabito.com`)
- **Purpose:** Your app's marketing website

---

## 📋 **App Information**

### 1. Category
- **Primary Category:** Required
  - Options: Business, Productivity, Social Networking, etc.
  - Choose most relevant
- **Secondary Category:** Optional
  - Can help with discoverability

### 2. Age Rating
- **Required:** Yes
- **Questions:** Answer honestly about content
- **Common for business apps:** 4+ or 12+

### 3. App Privacy
- **Required:** Yes
- **Questions:**
  - Does your app collect data?
  - What types of data?
  - How is data used?
  - Is data shared with third parties?
- **Be Honest:** Apple reviews this carefully

---

## ✅ **Pre-Submission Checklist**

Before submitting, ensure you have:

### Assets
- [ ] App icon (1024x1024 PNG)
- [ ] iPhone 6.7" screenshots (at least 1, recommended 3-10)
- [ ] iPhone 6.5" screenshots (at least 1, recommended 3-10)
- [ ] iPhone 5.5" screenshots (at least 1, recommended 3-10)
- [ ] iPad Pro 12.9" screenshots (if supporting iPad)
- [ ] iPad Pro 11" screenshots (if supporting iPad)
- [ ] App preview video (optional but recommended)

### Text Content
- [ ] App name (30 characters max)
- [ ] Subtitle (30 characters max)
- [ ] Description (4000 characters max)
- [ ] Keywords (100 characters max)
- [ ] Promotional text (optional, 170 characters max)

### URLs
- [ ] Privacy Policy URL (required, must be live)
- [ ] Support URL (required, must be live)
- [ ] Marketing URL (optional)

### App Information
- [ ] Primary category selected
- [ ] Secondary category selected (optional)
- [ ] Age rating completed
- [ ] App privacy questions answered

---

## 🛠️ **Tools for Creating Assets**

### Screenshot Tools:
- **iOS Simulator:** Take screenshots directly
- **Xcode:** Built-in screenshot tool
- **Figma/Photoshop:** Design mockups
- **AppMockUp:** Add device frames (optional)

### Icon Tools:
- **Figma:** Design icon
- **Photoshop:** Create icon
- **Online Icon Generators:** Create from existing image

### Video Tools:
- **QuickTime:** Record screen on Mac
- **iOS Screen Recording:** Built-in feature
- **After Effects:** Edit and enhance

---

## 📐 **Screenshot Best Practices**

1. **Show Key Features:**
   - Login/Signup screen
   - Main dashboard
   - Key functionality screens
   - Unique features

2. **Use Real Content:**
   - Real business names
   - Real-looking data
   - Professional appearance

3. **Tell a Story:**
   - First screenshot: App launch/login
   - Middle screenshots: Key features
   - Last screenshot: Call to action or success state

4. **Keep It Clean:**
   - No personal information
   - No sensitive data
   - Professional appearance

5. **Test on Devices:**
   - Take screenshots on actual devices
   - Ensure text is readable
   - Check colors and contrast

---

## 🎨 **Design Guidelines**

### Colors:
- Use your brand colors
- Ensure good contrast
- Test on different devices

### Typography:
- Use readable fonts
- Appropriate sizes
- Good hierarchy

### Layout:
- Show important content
- Avoid clutter
- Professional appearance

---

## 📱 **Device-Specific Notes**

### iPhone:
- Status bar will be hidden automatically
- Safe area respected automatically
- Notch handled automatically

### iPad:
- Show how app adapts to larger screen
- Highlight tablet-specific features
- Use landscape if relevant

---

## 🔄 **Updating Assets**

You can update these without app review:
- Screenshots
- Description
- Promotional text
- Keywords (limited changes)

You need app review for:
- App icon
- App name
- Category
- Age rating

---

## 📞 **Resources**

- **App Store Connect:** https://appstoreconnect.apple.com/
- **Human Interface Guidelines:** https://developer.apple.com/design/human-interface-guidelines/
- **App Store Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/

---

## ✅ **Final Checklist**

Before uploading to App Store Connect:

- [ ] All screenshots are correct sizes
- [ ] App icon is 1024x1024 PNG
- [ ] Privacy policy URL is live and accessible
- [ ] Support URL is live and accessible
- [ ] Description is compelling and keyword-optimized
- [ ] Keywords are relevant and under 100 characters
- [ ] All text is proofread
- [ ] Screenshots show real, professional content
- [ ] No placeholder text in screenshots
- [ ] App preview video is professional (if included)

---

**Good luck with your App Store submission! 🚀**


