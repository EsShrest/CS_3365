# Lottery Purchase System (LPS) Demo

Minimal local prototype based on the SRS.

## Demo Stack
- Backend: Node.js + Express
- Database: MySQL 8+ (local instance)
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
2. Ensure MySQL is running and create a local database (or let the app create it):
  - Default DB name: `lps_demo`
  - Connection defaults: `localhost:3306` with user `root` and empty password
  - Override with env vars: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
3. Start the app:
   - `npm start`
4. Open:
   - `http://localhost:3000`

## Demo Accounts
- Admin account (seeded):
  - Email: `admin@lps.local`
  - Password: `admin123`
- User account:
  - Create from `register.html`

## Notes
- This is a demo prototype, not production-secure.
- Sessions are in-memory and reset on server restart.
- MySQL data persists in your local database.
