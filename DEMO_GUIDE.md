# Lottery Purchase System (LPS) - Demonstration Guide

## Demo Objectives

This demo showcases a **feature-complete lottery ticket purchase system** built with Node.js + Express and MySQL. All functional requirements from the SRS have been implemented, including:

- User registration & authentication
- Game browsing with real-time search
- Ticket purchase & history
- Win calculation & claims processing
- Previous winning numbers display
- Admin dashboard with game management

---

## Pre-Demo Checklist

✅ **Server Running**: `npm start` → Server listening on `http://localhost:3000`
✅ **ARCHITECTURE.md Updated**: Documents all new features, endpoints, and tables
✅ **All Features Implemented**: 6 missing features from SRS audit now complete

---

## Demo Accounts

| Role | Email | Password | Details |
|------|-------|----------|---------|
| **Admin** | `admin@lps.local` | `admin123` | Full admin dashboard access |
| **Test User** | `john@example.com` | `Password123` | Pre-loaded with 4 sample transactions for testing claims |
| **New User** | Create via Register | Any 8+ char password | Full user features |

---

## Demo Flow

### 1️⃣ **Homepage & Navigation** (30 seconds)

1. Open `http://localhost:3000` in browser
2. Show the **clean, warm editorial design** (cream #f6f1e8, teal #1f7a8c, orange accents)
3. Point out main navigation:
   - **Browse Tickets** → Show search feature
   - **Dashboard** → Show stats & search form
   - **Winning Numbers** → NEW FEATURE
   - **Login** (top right)

---

### 2️⃣ **User Registration & Login** (1 minute)

#### Register:
1. Click **Register**
2. Fill form with:
   - Name: Demo User
   - Email: demo@test.com
   - Phone: 555-1234
   - Address: 123 Demo St
   - Password: DemoPass123
3. Click "Register" → Success message
4. Show success confirmation

#### Login:
1. Login with credentials just created (or use test account)
2. Redirect to **Dashboard**
3. Show:
   - User welcome message
   - **Stats card** (Tickets purchased, total spent, wins, winnings)
   - **Search form** with search bar

---

### 3️⃣ **NEW: Ticket Search Feature** (45 seconds)

#### Dashboard Search:
1. On dashboard, type **"Power"** in search box
2. Click "Search" button
3. Redirects to browse page with results filtered

#### Browse Page Real-Time Search:
1. Show browse-tickets.html with all 4 games visible
2. Type in the **search input** (above game cards)
3. Watch games filter **in real-time** as you type:
   - Type "Mega" → Shows Mega Millions
   - Type "Fast" → Shows Fast Cash 5
   - Type "xyz" → Shows no results
4. Shows **case-insensitive substring matching**

---

### 4️⃣ **Ticket Purchase** (1.5 minutes)

1. Click a game card (e.g., **Power Ball**)
2. Ticket Details page shows:
   - Game name, price, prize amount
   - Drawing date
   - **Select Numbers** section:
     - Auto-generate 5 random numbers (1-50 range, all unique) OR
     - Manually enter numbers
3. Choose **quantity** (1-10 tickets)
4. Select **payment method** (PayPal, Venmo, Bank)
5. Click **"Purchase Tickets"**
6. Success page shows:
   - Payment reference ID
   - Ticket confirmation codes
   - Total cost

---

### 5️⃣ **NEW: Order History & Details Modal** (1 minute)

1. Go to **Order History**
2. See table of purchased tickets
3. **Click any order row** → Opens **Order Details Modal** showing:
   - ✅ Ticket ID
   - ✅ Confirmation Code
   - ✅ Game name, drawing date
   - ✅ Selected numbers
   - ✅ **Winning numbers** (if draw date has passed)
   - ✅ Ticket status (Pending, Won, Lost)
   - ✅ Payout amount
   - ✅ Matches count
   - **Print Ticket** button → Shows printable ticket format
4. Close modal

---

### 6️⃣ **NEW: Prize Claims Flow** (1 minute) 

**Log in as test user** (`john@example.com` / `Password123`):

1. Go to **Order History**
2. Click an order from the pre-seeded transactions
3. In order details modal:
   - If **payout < $600**:
     - Show **claim form** with payment method select
     - Click "Claim Winnings"
     - Confirmation: "✅ Claim processed successfully"
     - Modal close → Order status now shows "Already claimed"
   - If **payout ≥ $600**:
     - Show **"In-person claim required"** message
     - Explain: Claims of $600+ require verification at claiming center

---

### 7️⃣ **NEW: Previous Winning Numbers** (30 seconds)

1. Click **"Winning Numbers"** link from any page (visible in header nav)
2. Shows **Winning Numbers** page with table:
   - **Columns**: Game Name, Draw Date, Winning Numbers
   - **Data**: Shows 12 sample draws (3 draws × 4 games)
   - Example:
     - Power Ball, 2026-03-30, [3, 12, 18, 24, 39]
     - Mega Millions, 2026-03-23, [5, 11, 19, 27, 46]
     - etc.
3. Return to any page

---

### 8️⃣ **Admin Dashboard** (2 minutes)

**Log in as admin** (`admin@lps.local` / `admin123`):

1. Show **Admin Dashboard** with:
   - **System Stats** (total tickets sold, revenue, winners, active users)
   - **Quick Actions** section
   - **Announcements** section:
     - Add new announcement (appears instantly)
     - Demonstrates localStorage persistence
     - Delete announcement
   - **Transactions Search**:
     - Search by User ID (e.g., "2" for John Doe)
     - Shows 4 sample transactions for John Doe

---

### 9️⃣ **NEW: Admin Ticket Management** (1 minute)

1. Navigate to **Admin** → **Manage Tickets** (or admin-tickets.html)
2. See table of all games (including disabled ones)
3. Click **"Edit"** on any game
4. **Edit Ticket Modal** shows:
   - Game name
   - Price
   - Prize amount
   - Drawing date
5. **Change values** (e.g., Price: $2.00 → $2.50)
6. Click **"Update Ticket"**
7. Confirmation message: "✅ Ticket updated"
8. Table refreshes showing new values

---

### 🔟 **Profile Management** (30 seconds)

1. Click **Profile** (from nav or user menu)
2. Show **User Profile Page**:
   - Name, email, phone, address display
   - Edit form to update name, phone, address
   - Click Edit → Make changes → Save
   - Confirmation: "✅ Profile updated"

---

## Key Features Demonstrated

| Feature | SRS Requirement | Demo Slide |
|---------|-----------------|-----------|
| **Ticket Search** | F.R.3c | Slide 3️⃣ |
| **Winning Numbers Page** | F.R.3d | Slide 7️⃣ |
| **Order Detail View** | F.R.6c | Slide 5️⃣ |
| **Prize Claims <$600** | F.R.7a | Slide 6️⃣ |
| **Prize Claims ≥$600 Redirect** | F.R.7b | Slide 6️⃣ |
| **Admin Ticket Updates** | F.R.8c | Slide 9️⃣ |
| **Purchase Tickets** | F.R.4a | Slide 4️⃣ |
| **Auth & Registration** | F.R.1a, F.R.1b | Slide 2️⃣ |
| **User Profile Management** | F.R.6a | Slide 🔟 |

---

## Technical Highlights to Mention

### Architecture
- **Backend**: Node.js + Express.js REST API
- **Database**: MySQL 8.0+ with 4 tables (users, games, tickets, **winning_numbers**)
- **Frontend**: Vanilla JavaScript + HTML/CSS (no frameworks)
- **Authentication**: Bearer token + in-memory session (demo-mode)
- **Design**: Warm editorial palette (cream #f6f1e8, teal #1f7a8c, orange accents)

### New Additions (Message 16 Batch)
- **New Table**: `winning_numbers` - Stores historical draws
- **New Columns**: `claim_status`, `claimed_at` on tickets table
- **5 New Endpoints**:
  - `GET /api/games?q=query` – Search games
  - `GET /api/history/:id` – Get ticket details
  - `POST /api/claims/:ticketId` – Claim prize
  - `PUT /api/admin/games/:id` – Update game
  - `GET /api/winning-numbers` – Get historical draws
- **New Frontend**:
  - winning-numbers.html (new page)
  - order-details-modal (new UI component)
  - Search forms + filters

### Security Features
- **Password**: Scrypt hash with random 16-byte salt
- **SQL Injection**: Parameterized queries on all database calls
- **Timing Attacks**: Constant-time password comparison
- **Authorization**: Role-based access control (is_admin flag)
- **Validation**: Server-side input validation on all APIs

---

## Talking Points

1. **"This system demonstrates a complete lottery ecosystem"**
   - Registration → Browse → Purchase → History → Claims
   - Admin interface for game management
   - Win calculation and payout tracking

2. **"All SRS requirements have been implemented and tested"**
   - 44 functional requirements addressable
   - 9 use cases covered
   - From registration through claims, all flows work end-to-end

3. **"Security is built-in, not added later"**
   - Passwords hashed with Scrypt (GPU-resistant)
   - All queries use parameterized statements
   - Timing-safe comparison prevents timing attacks
   - Role-based authorization prevents privilege escalation

4. **"The UI reflects modern design practices"**
   - Warm, editorial color palette
   - Responsive layout
   - Real-time search feedback
   - Clear information hierarchy

5. **"Features were added methodically based on requirements"**
   - SRS audit identified 6 gaps
   - All gaps addressed in final batch
   - ARCHITECTURE.md updated to reflect all changes

---

## Troubleshooting During Demo

| Issue | Fix |
|-------|-----|
| **Server won't start (port 3000 in use)** | Run: `Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` |
| **MySQL connection error** | Ensure MySQL is running locally (default: localhost:3306, user: root, password: root) |
| **Database doesn't exist** | Server auto-creates `lps_demo` database on first run |
| **Page won't load** | Hard refresh browser: `Ctrl+Shift+R` |
| **Data not persisting** | Sessions are in-memory; restart server to reset |

---

## After Demo

- Thank audience for their attention
- Note that this is a **demo prototype** (not production-ready)
- Explain trade-offs:
  - In-memory sessions (great for demo, not for scale)
  - Mock payments (would integrate Stripe/PayPal in production)
  - No HTTPS (would enable SSL/TLS for production)
- Open floor for questions

---

## Quick Links

- **GitHub/Git**: Repo stored locally at `c:\Documents\Notes\Sem6\CS3365\Project\T2`
- **Architecture Docs**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **README**: [README.md](README.md)
- **Server**: [server.js](server.js)
- **Database Script**: Server auto-initializes on first run

---

**Good luck with your demo!** 🎫
