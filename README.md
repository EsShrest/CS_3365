# Lottery Purchase System (LPS) Demo

Minimal local prototype based on the SRS.

## Demo Stack
- Backend: Node.js + Express
- Database: SQLite (local file in `data/lps.sqlite`)
- Auth: basic email/password + in-memory session token
- Payments: mocked and logged in `logs/payments.log`
- Email: fake log-based notifications in `logs/email.log`
- Hosting: local only

## Implemented Features
- User registration and login
- Browse available lottery games
- Select or auto-generate numbers (1-50)
- Purchase tickets with mock payment flow (1-10 tickets)
- View ticket/order history
- Profile view/update
- Basic admin demo:
  - admin login
  - view admin stats
  - add/disable lottery games

## Run Locally
1. Install dependencies:
   - `npm install`
2. Start the app:
   - `npm start`
3. Open:
   - `http://localhost:3000`

## Demo Accounts
- Admin account (seeded):
  - Email: `admin@lps.local`
  - Password: ` 
- User account:
  - Create from `register.html`

## Notes
- This is a demo prototype, not production-secure.
- Sessions are in-memory and reset on server restart.
- SQLite data persists in `data/lps.sqlite`.
