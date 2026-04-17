const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

const dataDir = path.join(__dirname, 'data');
const logsDir = path.join(__dirname, 'logs');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });

const dbPath = path.join(dataDir, 'lps.sqlite');
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.static(__dirname));

const sessions = new Map();

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = storedHash.split(':');
  const hashedBuffer = crypto.scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHash, 'hex');
  return crypto.timingSafeEqual(hashedBuffer, originalBuffer);
}

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

function parseNumbers(input) {
  if (!Array.isArray(input) || input.length !== 5) {
    return null;
  }
  const parsed = input.map((n) => Number(n));
  const valid = parsed.every((n) => Number.isInteger(n) && n >= 1 && n <= 50);
  if (!valid) {
    return null;
  }
  const unique = new Set(parsed);
  if (unique.size !== 5) {
    return null;
  }
  return [...unique].sort((a, b) => a - b);
}

function randomNumbers() {
  const values = new Set();
  while (values.size < 5) {
    values.add(Math.floor(Math.random() * 50) + 1);
  }
  return [...values].sort((a, b) => a - b);
}

function calculatePayout(matches, prizeAmount) {
  if (matches === 5) return prizeAmount;
  if (matches === 4) return prizeAmount * 0.2;
  if (matches === 3) return prizeAmount * 0.05;
  if (matches === 2) return prizeAmount * 0.01;
  return 0;
}

function appendLog(fileName, content) {
  const filePath = path.join(logsDir, fileName);
  fs.appendFileSync(filePath, `${content}\n`, 'utf-8');
}

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token || !sessions.has(token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = sessions.get(token);
    const user = await get('SELECT id, name, email, phone, address, is_admin FROM users WHERE id = ?', [userId]);
    if (!user) {
      sessions.delete(token);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      price REAL NOT NULL,
      prize_amount REAL NOT NULL,
      drawing_date TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_id INTEGER NOT NULL,
      numbers_json TEXT NOT NULL,
      purchase_total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      status TEXT NOT NULL,
      winning_numbers_json TEXT,
      matches INTEGER DEFAULT 0,
      payout REAL DEFAULT 0,
      confirmation_code TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(game_id) REFERENCES games(id)
    )
  `);

  const gameCount = await get('SELECT COUNT(*) AS count FROM games');
  if (gameCount.count === 0) {
    await run(
      `INSERT INTO games (name, price, prize_amount, drawing_date, active) VALUES
      ('Power Ball', 2.00, 1000000.00, '2026-12-31', 1),
      ('Mega Millions', 2.00, 2000000.00, '2026-12-15', 1),
      ('Lotto Texas', 1.00, 500000.00, '2026-11-30', 1),
      ('Texas Two Step', 1.00, 250000.00, '2026-11-25', 1)`
    );
  }

  const adminUser = await get('SELECT id FROM users WHERE email = ?', ['admin@lps.local']);
  if (!adminUser) {
    await run(
      'INSERT INTO users (name, email, phone, address, password_hash, is_admin) VALUES (?, ?, ?, ?, ?, 1)',
      ['Demo Admin', 'admin@lps.local', '0000000000', 'Admin Office', hashPassword('Admin123!')]
    );
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, address, password } = req.body;

    if (!name || !email || !phone || !address || !password) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const exists = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (exists) {
      res.status(409).json({ error: 'Email is already registered' });
      return;
    }

    await run(
      'INSERT INTO users (name, email, phone, address, password_hash) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), phone.trim(), address.trim(), hashPassword(password)]
    );

    res.json({ message: 'Registration successful' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = createToken();
    sessions.set(token, user.id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: !!user.is_admin,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  sessions.delete(req.token);
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/games', authMiddleware, async (req, res) => {
  const games = await all('SELECT id, name, price, prize_amount, drawing_date FROM games WHERE active = 1 ORDER BY id');
  res.json({ games });
});

app.get('/api/profile', authMiddleware, async (req, res) => {
  res.json({ profile: req.user });
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    if (!name || !phone || !address) {
      res.status(400).json({ error: 'Name, phone, and address are required' });
      return;
    }

    await run('UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?', [name.trim(), phone.trim(), address.trim(), req.user.id]);
    res.json({ message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: 'Profile update failed' });
  }
});

app.get('/api/user/stats', authMiddleware, async (req, res) => {
  const row = await get(
    `SELECT
      COUNT(*) AS total_tickets,
      SUM(purchase_total) AS total_spent,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS wins,
      SUM(payout) AS total_winnings
    FROM tickets WHERE user_id = ?`,
    [req.user.id]
  );

  res.json({
    stats: {
      total_tickets: row?.total_tickets || 0,
      total_spent: Number(row?.total_spent || 0),
      wins: row?.wins || 0,
      total_winnings: Number(row?.total_winnings || 0),
    },
  });
});

app.post('/api/purchase', authMiddleware, async (req, res) => {
  try {
    const { gameId, numbers, ticketCount, paymentMethod } = req.body;
    const count = Number(ticketCount);
    const validNumbers = parseNumbers(numbers);

    if (!Number.isInteger(count) || count < 1 || count > 10) {
      res.status(400).json({ error: 'Ticket count must be between 1 and 10' });
      return;
    }

    if (!validNumbers) {
      res.status(400).json({ error: 'Exactly 5 unique numbers between 1 and 50 are required' });
      return;
    }

    const allowedMethods = ['paypal', 'venmo', 'bank'];
    if (!allowedMethods.includes(paymentMethod)) {
      res.status(400).json({ error: 'Invalid payment method' });
      return;
    }

    const game = await get('SELECT id, name, price, prize_amount, drawing_date FROM games WHERE id = ? AND active = 1', [gameId]);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const total = Number(game.price) * count;
    const paymentRef = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    appendLog('payments.log', `[${new Date().toISOString()}] mock_payment success ref=${paymentRef} user=${req.user.email} method=${paymentMethod} amount=${total.toFixed(2)}`);

    const purchasedTickets = [];
    const drawDate = new Date(`${game.drawing_date}T23:59:59`);
    const now = new Date();

    for (let i = 0; i < count; i += 1) {
      const confirmationCode = `CNF-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      let status = 'pending';
      let winningNumbers = null;
      let matches = 0;
      let payout = 0;

      if (drawDate <= now) {
        winningNumbers = randomNumbers();
        matches = validNumbers.filter((n) => winningNumbers.includes(n)).length;
        payout = calculatePayout(matches, Number(game.prize_amount));
        status = payout > 0 ? 'won' : 'lost';

        if (status === 'won') {
          appendLog('email.log', `[${new Date().toISOString()}] to=${req.user.email} subject="You have a winning ticket" ticket=${confirmationCode} payout=${payout.toFixed(2)}`);
        }
      }

      const result = await run(
        `INSERT INTO tickets
        (user_id, game_id, numbers_json, purchase_total, payment_method, payment_status, status, winning_numbers_json, matches, payout, confirmation_code)
        VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          game.id,
          JSON.stringify(validNumbers),
          Number(game.price),
          paymentMethod,
          status,
          winningNumbers ? JSON.stringify(winningNumbers) : null,
          matches,
          payout,
          confirmationCode,
        ]
      );

      purchasedTickets.push({
        id: result.lastID,
        confirmationCode,
        numbers: validNumbers,
        status,
        payout,
      });
    }

    res.json({
      message: 'Purchase successful (mock payment)',
      paymentRef,
      game: {
        id: game.id,
        name: game.name,
        price: Number(game.price),
      },
      ticketCount: count,
      total,
      tickets: purchasedTickets,
    });
  } catch (error) {
    res.status(500).json({ error: 'Purchase failed' });
  }
});

app.get('/api/history', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT
      t.id,
      t.confirmation_code,
      t.numbers_json,
      t.purchase_total,
      t.payment_method,
      t.status,
      t.winning_numbers_json,
      t.matches,
      t.payout,
      t.created_at,
      g.name AS game_name,
      g.drawing_date
    FROM tickets t
    JOIN games g ON g.id = t.game_id
    WHERE t.user_id = ?
    ORDER BY t.id DESC`,
    [req.user.id]
  );

  const tickets = rows.map((r) => ({
    id: r.id,
    confirmation_code: r.confirmation_code,
    game_name: r.game_name,
    drawing_date: r.drawing_date,
    created_at: r.created_at,
    numbers: JSON.parse(r.numbers_json),
    winning_numbers: r.winning_numbers_json ? JSON.parse(r.winning_numbers_json) : null,
    purchase_total: Number(r.purchase_total),
    payment_method: r.payment_method,
    status: r.status,
    matches: r.matches,
    payout: Number(r.payout),
  }));

  res.json({ tickets });
});

app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  const totals = await get(
    `SELECT
      COUNT(*) AS tickets_sold,
      SUM(purchase_total) AS revenue,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS wins
    FROM tickets`
  );
  const users = await get('SELECT COUNT(*) AS user_count FROM users WHERE is_admin = 0');

  res.json({
    stats: {
      tickets_sold: totals?.tickets_sold || 0,
      revenue: Number(totals?.revenue || 0),
      wins: totals?.wins || 0,
      users: users?.user_count || 0,
    },
  });
});

app.get('/api/admin/games', authMiddleware, adminOnly, async (req, res) => {
  const games = await all('SELECT id, name, price, prize_amount, drawing_date, active FROM games ORDER BY id');
  res.json({ games });
});

app.post('/api/admin/games', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, price, prizeAmount, drawingDate } = req.body;
    if (!name || !price || !prizeAmount || !drawingDate) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    await run('INSERT INTO games (name, price, prize_amount, drawing_date, active) VALUES (?, ?, ?, ?, 1)', [
      name.trim(),
      Number(price),
      Number(prizeAmount),
      drawingDate,
    ]);

    res.json({ message: 'Game added' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add game' });
  }
});

app.delete('/api/admin/games/:id', authMiddleware, adminOnly, async (req, res) => {
  await run('UPDATE games SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Game removed' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`LPS demo server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
