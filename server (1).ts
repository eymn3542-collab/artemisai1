import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const db = new Database('artemis.db');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT
  );
  
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    messages TEXT,
    timestamp INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy is required for secure cookies in AI Studio
  app.set('trust proxy', 1);

  app.use(express.json());
  
  // No more sessions or passport needed for a direct access app
  
  // Default user for the single-user experience
  const DEFAULT_USER = {
    id: 'artemis_user',
    display_name: 'Artemis AI Kullanıcısı',
    email: 'user@artemis.ai',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Artemis'
  };

  // Ensure default user exists in DB
  db.prepare(`
    INSERT INTO users (id, email, display_name, avatar_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(DEFAULT_USER.id, DEFAULT_USER.email, DEFAULT_USER.display_name, DEFAULT_USER.avatar_url);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/me', (req, res) => {
    res.json(DEFAULT_USER);
  });

  app.post('/api/logout', (req, res) => {
    res.json({ success: true });
  });

  // Chat API - No auth required, uses DEFAULT_USER.id
  app.get('/api/chats', (req, res) => {
    const chats = db.prepare('SELECT * FROM chats WHERE user_id = ? ORDER BY timestamp DESC').all(DEFAULT_USER.id);
    res.json(chats.map((c: any) => ({ ...c, messages: JSON.parse(c.messages) })));
  });

  app.post('/api/chats', (req, res) => {
    const { id, title, messages, timestamp } = req.body;
    
    db.prepare(`
      INSERT INTO chats (id, user_id, title, messages, timestamp)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        messages = excluded.messages,
        timestamp = excluded.timestamp
    `).run(id, DEFAULT_USER.id, title, JSON.stringify(messages), timestamp);
    
    res.json({ success: true });
  });

  app.delete('/api/chats/:id', (req, res) => {
    db.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?').run(req.params.id, DEFAULT_USER.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
