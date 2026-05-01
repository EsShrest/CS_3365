const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

const logsDir = path.join(__dirname, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'root',
  port: Number(process.env.MYSQL_PORT || 3306),
};

const dbNameRaw = process.env.MYSQL_DATABASE || 'lps_demo';
const dbName = /^[A-Za-z0-9_]+$/.test(dbNameRaw) ? dbNameRaw : 'lps_demo';

let db;

app.use(express.json());
app.use(express.static(__dirname));

const sessions = new Map();

async function run(sql, params = []) {
  const [result] = await db.execute(sql, params);
  return result;
}

async function get(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows[0];
}

async function all(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
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
  const bootstrap = await mysql.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port,
  });

  await bootstrap.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await bootstrap.end();

  db = mysql.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port,
    database: dbName,
    connectionLimit: 10,
  });

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(50) NOT NULL,
      address VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS games (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      price DECIMAL(10, 2) NOT NULL,
      prize_amount DECIMAL(12, 2) NOT NULL,
      drawing_date DATE NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      game_id INT NOT NULL,
      numbers_json TEXT NOT NULL,
      purchase_total DECIMAL(10, 2) NOT NULL,
      payment_method VARCHAR(20) NOT NULL,
      payment_status VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      winning_numbers_json TEXT,
      matches INT DEFAULT 0,
      payout DECIMAL(12, 2) DEFAULT 0,
      confirmation_code VARCHAR(60) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(game_id) REFERENCES games(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS winning_numbers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      game_id INT NOT NULL,
      draw_date DATE NOT NULL,
      numbers_json TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(game_id) REFERENCES games(id)
    )
  `);

  try {
    await run('ALTER TABLE tickets ADD COLUMN claim_status VARCHAR(20) NOT NULL DEFAULT "unclaimed"');
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }

  try {
    await run('ALTER TABLE tickets ADD COLUMN claimed_at DATETIME NULL');
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }

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
      ['Demo Admin', 'admin@lps.local', '0000000000', 'Admin Office', hashPassword('admin123')]
    );
  } else {
    await run('UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?', [hashPassword('admin123'), adminUser.id]);
  }

  // Add test user (John Doe) with fake transactions
  let johnDoeUser = await get('SELECT id FROM users WHERE email = ?', ['john@example.com']);
  if (!johnDoeUser) {
    const result = await run(
      'INSERT INTO users (name, email, phone, address, password_hash, is_admin) VALUES (?, ?, ?, ?, ?, 0)',
      ['John Doe', 'john@example.com', '5551234567', '123 Main St, Austin, TX 78701', hashPassword('Password123')]
    );
    johnDoeUser = result;
  }

  // Add fake transactions for John Doe
  const johnTransactions = await all('SELECT id FROM tickets WHERE user_id = ?', [johnDoeUser.insertId || johnDoeUser.id || 2]);
  const johnId = johnDoeUser.insertId || johnDoeUser.id || 2;

  await run('UPDATE tickets SET status = "lost" WHERE user_id = ? AND status = "completed"', [johnId]);

  const seedGames = await all('SELECT id, price, prize_amount FROM games ORDER BY id LIMIT 4');

  if (johnTransactions.length === 0) {
    if (seedGames.length > 0) {
      const baseTransactions = [
        {
          gameId: seedGames[0].id,
          price: seedGames[0].price,
          numbers: [7, 14, 21, 35, 42],
          payment: 'paypal',
          status: 'pending',
          winningNumbers: null,
          matches: 0,
          payout: 0,
        },
        {
          gameId: seedGames[1].id,
          price: seedGames[1].price,
          numbers: [5, 15, 25, 35, 45],
          payment: 'venmo',
          status: 'lost',
          winningNumbers: [2, 8, 19, 31, 44],
          matches: 0,
          payout: 0,
        },
        {
          gameId: seedGames[2].id,
          price: seedGames[2].price,
          numbers: [3, 9, 17, 33, 48],
          payment: 'bank',
          status: 'lost',
          winningNumbers: [1, 11, 18, 22, 39],
          matches: 0,
          payout: 0,
        },
        {
          gameId: seedGames[3].id,
          price: seedGames[3].price,
          numbers: [2, 8, 16, 24, 40],
          payment: 'paypal',
          status: 'won',
          winningNumbers: [2, 8, 16, 24, 40],
          matches: 5,
          payout: Number(seedGames[3].prize_amount),
        },
      ];

      for (const trans of baseTransactions) {
        await run(
          `INSERT INTO tickets (user_id, game_id, numbers_json, purchase_total, payment_method, payment_status, status, winning_numbers_json, matches, payout, confirmation_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            johnId,
            trans.gameId,
            JSON.stringify(trans.numbers),
            Number(trans.price),
            trans.payment,
            trans.status === 'pending' ? 'pending' : 'paid',
            trans.status,
            trans.winningNumbers ? JSON.stringify(trans.winningNumbers) : null,
            trans.matches,
            trans.payout,
            crypto.randomBytes(20).toString('hex'),
          ]
        );
      }
    }
  }

  if (seedGames.length > 0) {
    const seededRows = await all('SELECT COUNT(*) AS count FROM tickets WHERE user_id = ?', [johnId]);
    const existingCount = seededRows[0]?.count || 0;
    const desiredCount = 7;

    if (existingCount < desiredCount) {
      const extraWinningTickets = [
        {
          gameId: seedGames[0].id,
          price: seedGames[0].price,
          numbers: [1, 2, 3, 4, 5],
          winningNumbers: [1, 2, 6, 7, 8],
          matches: 2,
          payout: 250,
          payment: 'paypal',
        },
        {
          gameId: seedGames[1].id,
          price: seedGames[1].price,
          numbers: [10, 11, 12, 13, 14],
          winningNumbers: [10, 11, 12, 40, 41],
          matches: 3,
          payout: 500,
          payment: 'venmo',
        },
        {
          gameId: seedGames[2].id,
          price: seedGames[2].price,
          numbers: [20, 21, 22, 23, 24],
          winningNumbers: [20, 21, 22, 23, 24],
          matches: 5,
          payout: 1000,
          payment: 'bank',
        },
      ];

      const needed = desiredCount - existingCount;
      for (const trans of extraWinningTickets.slice(0, needed)) {
        await run(
          `INSERT INTO tickets (user_id, game_id, numbers_json, purchase_total, payment_method, payment_status, status, winning_numbers_json, matches, payout, confirmation_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ,
          [
            johnId,
            trans.gameId,
            JSON.stringify(trans.numbers),
            Number(trans.price),
            trans.payment,
            'paid',
            'won',
            JSON.stringify(trans.winningNumbers),
            trans.matches,
            trans.payout,
            crypto.randomBytes(20).toString('hex'),
          ]
        );
      }
    }

    const missingWinningNumbers = await all(
      `SELECT t.id, t.status, t.numbers_json, g.prize_amount
       FROM tickets t
       JOIN games g ON g.id = t.game_id
       WHERE t.user_id = ? AND t.status <> 'pending' AND t.winning_numbers_json IS NULL`,
      [johnId]
    );

    for (const ticket of missingWinningNumbers) {
      const ticketNumbers = JSON.parse(ticket.numbers_json);
      const winningNumbers = ticket.status === 'won' ? ticketNumbers : randomNumbers();
      const matches = ticket.status === 'won' ? ticketNumbers.length : 0;
      const payout = ticket.status === 'won' ? Number(ticket.prize_amount) : 0;

      await run(
        'UPDATE tickets SET winning_numbers_json = ?, matches = ?, payout = ? WHERE id = ? AND user_id = ?',
        [JSON.stringify(winningNumbers), matches, payout, ticket.id, johnId]
      );
    }
  }

  const winningCount = await get('SELECT COUNT(*) AS count FROM winning_numbers');
  if (winningCount.count === 0) {
    const games = await all('SELECT id FROM games ORDER BY id');
    const sampleDraws = [
      { date: '2026-03-30', numbers: [3, 12, 18, 24, 39] },
      { date: '2026-03-23', numbers: [5, 11, 19, 27, 46] },
      { date: '2026-03-16', numbers: [7, 14, 21, 33, 45] },
    ];

    for (const game of games) {
      for (const draw of sampleDraws) {
        await run(
          'INSERT INTO winning_numbers (game_id, draw_date, numbers_json) VALUES (?, ?, ?)',
          [game.id, draw.date, JSON.stringify(draw.numbers)]
        );
      }
    }
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
  const query = (req.query.q || '').trim();
  if (query) {
    const games = await all(
      'SELECT id, name, price, prize_amount, drawing_date FROM games WHERE active = 1 AND name LIKE ? ORDER BY id',
      [`%${query}%`]
    );
    res.json({ games });
    return;
  }

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
      t.claim_status,
      t.claimed_at,
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
    claim_status: r.claim_status,
    claimed_at: r.claimed_at,
  }));

  res.json({ tickets });
});

app.get('/api/history/:id', authMiddleware, async (req, res) => {
  const row = await get(
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
      t.claim_status,
      t.claimed_at,
      t.created_at,
      g.name AS game_name,
      g.drawing_date
    FROM tickets t
    JOIN games g ON g.id = t.game_id
    WHERE t.user_id = ? AND t.id = ?`,
    [req.user.id, req.params.id]
  );

  if (!row) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  res.json({
    ticket: {
      id: row.id,
      confirmation_code: row.confirmation_code,
      game_name: row.game_name,
      drawing_date: row.drawing_date,
      created_at: row.created_at,
      numbers: JSON.parse(row.numbers_json),
      winning_numbers: row.winning_numbers_json ? JSON.parse(row.winning_numbers_json) : null,
      purchase_total: Number(row.purchase_total),
      payment_method: row.payment_method,
      status: row.status,
      matches: row.matches,
      payout: Number(row.payout),
      claim_status: row.claim_status,
      claimed_at: row.claimed_at,
    },
  });
});

app.post('/api/claims/:ticketId', authMiddleware, async (req, res) => {
  const { method } = req.body;
  const allowedMethods = ['paypal', 'venmo', 'bank'];
  if (!allowedMethods.includes(method)) {
    res.status(400).json({ error: 'Invalid claim method' });
    return;
  }

  const ticket = await get(
    'SELECT id, status, payout, claim_status FROM tickets WHERE id = ? AND user_id = ?',
    [req.params.ticketId, req.user.id]
  );

  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  if (ticket.status !== 'won' || Number(ticket.payout) <= 0) {
    res.status(400).json({ error: 'Ticket is not eligible for a claim' });
    return;
  }

  if (ticket.claim_status === 'claimed') {
    res.status(400).json({ error: 'Ticket has already been claimed' });
    return;
  }

  if (Number(ticket.payout) >= 600) {
    res.json({
      requireInPerson: true,
      message: 'Claims of $600 or more must be verified in person at a claiming center.'
    });
    return;
  }

  await run(
    'UPDATE tickets SET claim_status = ?, claimed_at = NOW() WHERE id = ? AND user_id = ?',
    ['claimed', ticket.id, req.user.id]
  );

  res.json({ message: 'Claim processed successfully', requireInPerson: false });
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

app.put('/api/admin/games/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, price, prizeAmount, drawingDate } = req.body;
    if (!name || !price || !prizeAmount || !drawingDate) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    await run(
      'UPDATE games SET name = ?, price = ?, prize_amount = ?, drawing_date = ? WHERE id = ?',
      [name.trim(), Number(price), Number(prizeAmount), drawingDate, req.params.id]
    );

    res.json({ message: 'Game updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update game' });
  }
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

app.get('/api/admin/transactions/:userId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.userId;
    const transactions = await all(
      `SELECT 
        t.id, 
        t.confirmation_code, 
        u.name AS user_name,
        u.email,
        g.name AS game_name, 
        g.drawing_date,
        t.created_at,
        t.numbers_json,
        t.purchase_total,
        t.payment_method,
        t.status,
        t.matches,
        t.payout
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN games g ON t.game_id = g.id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC`,
      [userId]
    );
    
    const formattedTransactions = transactions.map(t => ({
      id: t.id,
      confirmation_code: t.confirmation_code,
      user_name: t.user_name,
      email: t.email,
      game_name: t.game_name,
      drawing_date: t.drawing_date,
      created_at: t.created_at,
      numbers: JSON.parse(t.numbers_json),
      purchase_total: Number(t.purchase_total),
      payment_method: t.payment_method,
      status: t.status,
      matches: t.matches,
      payout: Number(t.payout)
    }));
    
    res.json({ transactions: formattedTransactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.get('/api/winning-numbers', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT w.id, w.draw_date, w.numbers_json, g.name AS game_name
     FROM winning_numbers w
     JOIN games g ON g.id = w.game_id
     ORDER BY w.draw_date DESC, g.name`
  );

  const draws = rows.map((row) => ({
    id: row.id,
    game_name: row.game_name,
    draw_date: row.draw_date,
    numbers: JSON.parse(row.numbers_json),
  }));

  res.json({ draws });
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
