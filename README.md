<<<<<<< HEAD
# ApplyMate Chrome Extension

A browser extension that auto-fills job applications in 1 click using your ApplyMate profile.

## Supported Platforms
- Workday (*.myworkdayjobs.com)
- Greenhouse (.greenhouse.io)
- Lever (.lever.co)
- Ashby (.ashbyhq.com)
- Jobvite (.jobvite.com)
- SmartRecruiters (.smartrecruiters.com)

## How to Load in Chrome (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions`
2. Toggle **Developer Mode** ON (top right switch)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder
5. The ApplyMate icon will appear in your Chrome toolbar

## How to Add Icons

Create 3 PNG icons and place them in the `icons/` folder:
- `icons/icon16.png` → 16×16px
- `icons/icon48.png` → 48×48px
- `icons/icon128.png` → 128×128px

Use the ApplyMate purple/indigo lightning bolt logo.

## How to Use

1. Click the ApplyMate icon in Chrome
2. Paste your **ApplyMate Token** (get it from your Profile page → Token)
3. Navigate to any supported job application page
4. The popup shows a green badge when a form is detected
5. Click **Autofill Application** — fields like name, email, phone are filled instantly!

## Fields Autofilled

| Field | Source |
|-------|--------|
| First Name | Profile name (first word) |
| Last Name | Profile name (remaining) |
| Email | Profile email |
| Phone | Profile phone |
| Address, City, State, Zip | Profile address |
| LinkedIn | Profile linkedin |
| Portfolio/Website | Profile website |
| Bio/Cover Text | Profile bio |

## Files
- `manifest.json` - Extension config (Manifest V3)
- `popup.html` / `popup.js` - The extension popup UI
- `content.js` - Injected into job pages to detect + fill forms
- `background.js` - Service worker for badge & messaging
=======
# applymate_extension
>>>>>>> 22cf06e1cc150230367f608ffa89149d7374281f
