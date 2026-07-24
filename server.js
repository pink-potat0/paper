const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const mongoose = require('mongoose');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

const USERNAME_RE = /^[a-zA-Z0-9_]{2,24}$/;
const SOLANA_MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let mongoConnectionPromise = null;
let sqliteDb = null;
let creatorRewardCache = null;

function getMongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || '';
}

function hasMongoUri() {
  return Boolean(getMongoUri());
}

function allowSqliteFallback() {
  return String(process.env.ALLOW_SQLITE_FALLBACK || '').toLowerCase() === 'true';
}

const walletUserSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true },
  usernameNormalized: { type: String, required: true, unique: true, index: true },
  walletName: { type: String, default: 'Wallet' },
  stats: {
    pnlSol: { type: Number, default: 0 },
    trades: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    volumeSol: { type: Number, default: 0 },
    balanceSol: { type: Number, default: 0 },
    updatedAt: { type: Date, default: null },
  },
}, { timestamps: true });

const walletChallengeSchema = new mongoose.Schema({
  nonce: { type: String, required: true, unique: true, index: true },
  walletAddress: { type: String, required: true },
  username: { type: String, required: true },
  usernameNormalized: { type: String, required: true },
  memo: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

const paperTradeEventSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true, index: true },
  walletAddress: { type: String, required: true, index: true },
  kind: { type: String, enum: ['buy', 'sell'], required: true },
  sol: { type: Number, required: true, default: 0 },
  tradedAt: { type: Date, required: true, index: true },
}, { timestamps: true });

const userLessonProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  lessonId: { type: String, required: true },
  completed: { type: Boolean, default: false },
  score: { type: Number, default: 0 },
  timeSpent: { type: Number, default: 0 },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  completedAt: { type: Date, default: null },
  lastAccessed: { type: Date, default: Date.now },
}, { timestamps: true });
userLessonProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

const userChatMessageSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  message: { type: String, required: true },
  isUser: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

const userPracticeSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

const WalletUser = mongoose.models.WalletUser || mongoose.model('WalletUser', walletUserSchema);
const WalletChallenge = mongoose.models.WalletChallenge || mongoose.model('WalletChallenge', walletChallengeSchema);
const PaperTradeEvent = mongoose.models.PaperTradeEvent || mongoose.model('PaperTradeEvent', paperTradeEventSchema);
const UserLessonProgress = mongoose.models.UserLessonProgress || mongoose.model('UserLessonProgress', userLessonProgressSchema);
const UserChatMessage = mongoose.models.UserChatMessage || mongoose.model('UserChatMessage', userChatMessageSchema);
const UserPracticeSession = mongoose.models.UserPracticeSession || mongoose.model('UserPracticeSession', userPracticeSessionSchema);

async function connectMongo() {
  const uri = getMongoUri();
  if (!uri) return null;
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose.connect(uri)
      .then(async () => {
        await Promise.all([
          WalletUser.init(),
          WalletChallenge.init(),
          PaperTradeEvent.init(),
          UserLessonProgress.init(),
          UserChatMessage.init(),
          UserPracticeSession.init(),
        ]);
        return mongoose.connection;
      })
      .catch((error) => {
        mongoConnectionPromise = null;
        throw error;
      });
  }
  return mongoConnectionPromise;
}

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;
  if (!allowSqliteFallback()) {
    throw new Error('Set MONGODB_URI. SQLite is only available when ALLOW_SQLITE_FALLBACK=true for local tests.');
  }
  const { DatabaseSync } = require('node:sqlite');
  const databasePath = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'paper.sqlite');
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  sqliteDb = new DatabaseSync(databasePath);
  sqliteDb.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS wallet_users (
      wallet_address TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL UNIQUE,
      wallet_name TEXT NOT NULL DEFAULT 'Wallet',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallet_challenges (
      nonce TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL,
      memo TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wallet_challenges_expires_at ON wallet_challenges(expires_at);
    CREATE TABLE IF NOT EXISTS paper_trade_events (
      event_key TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      kind TEXT NOT NULL,
      sol REAL NOT NULL DEFAULT 0,
      traded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS paper_trade_events_traded_at ON paper_trade_events(traded_at);
    CREATE INDEX IF NOT EXISTS paper_trade_events_wallet_address ON paper_trade_events(wallet_address);
    CREATE TABLE IF NOT EXISTS user_lesson_progress (
      user_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      time_spent REAL NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL DEFAULT '{}',
      completed_at TEXT,
      last_accessed TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, lesson_id)
    );
    CREATE TABLE IF NOT EXISTS user_chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      is_user INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS user_chat_messages_user_created ON user_chat_messages(user_id, created_at);
    CREATE TABLE IF NOT EXISTS user_practice_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS user_practice_sessions_user_created ON user_practice_sessions(user_id, created_at);
  `);
  [
    'ALTER TABLE wallet_users ADD COLUMN pnl_sol REAL NOT NULL DEFAULT 0',
    'ALTER TABLE wallet_users ADD COLUMN trades INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE wallet_users ADD COLUMN wins INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE wallet_users ADD COLUMN losses INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE wallet_users ADD COLUMN win_rate REAL NOT NULL DEFAULT 0',
    'ALTER TABLE wallet_users ADD COLUMN volume_sol REAL NOT NULL DEFAULT 0',
    'ALTER TABLE wallet_users ADD COLUMN balance_sol REAL NOT NULL DEFAULT 0',
    'ALTER TABLE wallet_users ADD COLUMN stats_updated_at TEXT',
  ].forEach((statement) => {
    try { sqliteDb.exec(statement); } catch (error) {
      if (!/duplicate column name/i.test(error.message)) throw error;
    }
  });
  return sqliteDb;
}

function sqliteUser(row) {
  if (!row) return null;
  return {
    walletAddress: row.wallet_address,
    username: row.username,
    usernameNormalized: row.username_normalized,
    walletName: row.wallet_name,
    stats: {
      pnlSol: Number(row.pnl_sol) || 0,
      trades: Number(row.trades) || 0,
      wins: Number(row.wins) || 0,
      losses: Number(row.losses) || 0,
      winRate: Number(row.win_rate) || 0,
      volumeSol: Number(row.volume_sol) || 0,
      balanceSol: Number(row.balance_sol) || 0,
      updatedAt: row.stats_updated_at || null,
    },
  };
}

function sqliteChallenge(row) {
  if (!row) return null;
  return {
    nonce: row.nonce,
    walletAddress: row.wallet_address,
    username: row.username,
    usernameNormalized: row.username_normalized,
    memo: row.memo,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

async function initWalletStore() {
  if (hasMongoUri()) return connectMongo();
  return getSqliteDb();
}

async function getWalletUser(walletAddress) {
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    return WalletUser.findOne({ walletAddress }).lean();
  }
  return sqliteUser(getSqliteDb().prepare(
    'SELECT * FROM wallet_users WHERE wallet_address = ?'
  ).get(walletAddress));
}

async function findClaimedWalletUser(walletAddress, usernameNormalized) {
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    return WalletUser.findOne({ $or: [{ walletAddress }, { usernameNormalized }] }).lean();
  }
  return sqliteUser(getSqliteDb().prepare(
    'SELECT * FROM wallet_users WHERE wallet_address = ? OR username_normalized = ? LIMIT 1'
  ).get(walletAddress, usernameNormalized));
}

async function createWalletChallenge(challenge) {
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) return WalletChallenge.create(challenge);
  const db = getSqliteDb();
  db.prepare('DELETE FROM wallet_challenges WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare(`
    INSERT INTO wallet_challenges
      (nonce, wallet_address, username, username_normalized, memo, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(
    challenge.nonce,
    challenge.walletAddress,
    challenge.username,
    challenge.usernameNormalized,
    challenge.memo,
    challenge.expiresAt.toISOString(),
    new Date().toISOString()
  );
}

async function consumeWalletChallenge(nonce) {
  await initWalletStore();
  const now = new Date();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    return WalletChallenge.findOneAndUpdate({
      nonce,
      usedAt: null,
      expiresAt: { $gt: now },
    }, { $set: { usedAt: now } }, { new: true }).lean();
  }
  return sqliteChallenge(getSqliteDb().prepare(`
    UPDATE wallet_challenges SET used_at = ?
    WHERE nonce = ? AND used_at IS NULL AND expires_at > ?
    RETURNING *
  `).get(now.toISOString(), nonce, now.toISOString()));
}

async function createWalletUser(user) {
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) return WalletUser.create(user);
  const db = getSqliteDb();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO wallet_users
        (wallet_address, username, username_normalized, wallet_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.walletAddress, user.username, user.usernameNormalized, user.walletName, now, now);
    return user;
  } catch (error) {
    if (String(error.code || '').startsWith('SQLITE_CONSTRAINT')) {
      const walletTaken = Boolean(db.prepare(
        'SELECT 1 FROM wallet_users WHERE wallet_address = ?'
      ).get(user.walletAddress));
      error.code = 11000;
      error.keyPattern = walletTaken ? { walletAddress: 1 } : { usernameNormalized: 1 };
    }
    throw error;
  }
}

function safeJsonParse(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeProfileInput(userId, userData = {}) {
  const walletAddress = String(userId || userData.walletAddress || '').trim();
  const rawUsername = String(userData.username || userData.displayName || '').trim();
  const username = USERNAME_RE.test(rawUsername)
    ? rawUsername
    : (walletAddress ? walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4) : 'user');
  return {
    walletAddress,
    username,
    usernameNormalized: username.toLowerCase(),
    walletName: String(userData.walletName || 'Wallet').trim().slice(0, 50) || 'Wallet',
  };
}

async function upsertUserProfile(userId, userData = {}) {
  const profile = normalizeProfileInput(userId, userData);
  if (!validWalletAddress(profile.walletAddress)) throw new Error('Invalid wallet address');
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    const existing = await WalletUser.findOne({ walletAddress: profile.walletAddress }).lean();
    if (!existing) {
      return WalletUser.create(profile);
    }
    const update = { walletName: profile.walletName };
    if (profile.username && profile.username !== existing.username) {
      update.username = profile.username;
      update.usernameNormalized = profile.usernameNormalized;
    }
    return WalletUser.findOneAndUpdate(
      { walletAddress: profile.walletAddress },
      { $set: update },
      { new: true }
    ).lean();
  }

  const db = getSqliteDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO wallet_users
      (wallet_address, username, username_normalized, wallet_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      username = excluded.username,
      username_normalized = excluded.username_normalized,
      wallet_name = excluded.wallet_name,
      updated_at = excluded.updated_at
  `).run(
    profile.walletAddress,
    profile.username,
    profile.usernameNormalized,
    profile.walletName,
    now,
    now
  );
  return getWalletUser(profile.walletAddress);
}

async function isUsernameFree(username, currentUserId = '') {
  const normalized = String(username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(username || '')) return false;
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    const existing = await WalletUser.findOne({ usernameNormalized: normalized }).lean();
    return !existing || existing.walletAddress === currentUserId;
  }
  const existing = getSqliteDb().prepare(
    'SELECT wallet_address FROM wallet_users WHERE username_normalized = ? LIMIT 1'
  ).get(normalized);
  return !existing || existing.wallet_address === currentUserId;
}

function serializeProfile(user) {
  if (!user) return null;
  return {
    uid: user.walletAddress,
    walletAddress: user.walletAddress,
    username: user.username,
    walletName: user.walletName || 'Wallet',
    stats: user.stats || {
      totalLessons: 0,
      completedLessons: 0,
      progressPercentage: 0,
      averageScore: 0,
      totalTimeSpent: 0,
    },
  };
}

function normalizeLessonProgress(lessonId, data = {}) {
  return {
    lessonId,
    completed: Boolean(data.completed),
    score: finiteStat(data.score),
    timeSpent: finiteStat(data.timeSpent),
    completedAt: data.completed ? (data.completedAt || new Date().toISOString()) : null,
    ...data,
  };
}

async function saveLessonProgressData(userId, lessonId, data = {}) {
  if (!validWalletAddress(userId)) throw new Error('Invalid wallet address');
  const progress = normalizeLessonProgress(lessonId, data);
  const now = new Date();
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    await UserLessonProgress.findOneAndUpdate(
      { userId, lessonId },
      {
        $set: {
          completed: progress.completed,
          score: progress.score,
          timeSpent: progress.timeSpent,
          data: progress,
          completedAt: progress.completedAt ? new Date(progress.completedAt) : null,
          lastAccessed: now,
        },
      },
      { upsert: true, new: true }
    );
    return progress;
  }
  getSqliteDb().prepare(`
    INSERT INTO user_lesson_progress
      (user_id, lesson_id, completed, score, time_spent, data_json, completed_at, last_accessed, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET
      completed = excluded.completed,
      score = excluded.score,
      time_spent = excluded.time_spent,
      data_json = excluded.data_json,
      completed_at = excluded.completed_at,
      last_accessed = excluded.last_accessed,
      updated_at = excluded.updated_at
  `).run(
    userId,
    lessonId,
    progress.completed ? 1 : 0,
    progress.score,
    progress.timeSpent,
    JSON.stringify(progress),
    progress.completedAt,
    now.toISOString(),
    now.toISOString()
  );
  return progress;
}

async function getAllLessonProgressData(userId) {
  if (!validWalletAddress(userId)) throw new Error('Invalid wallet address');
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    const rows = await UserLessonProgress.find({ userId }).lean();
    return rows.reduce((acc, row) => {
      acc[row.lessonId] = {
        lessonId: row.lessonId,
        completed: Boolean(row.completed),
        score: finiteStat(row.score),
        timeSpent: finiteStat(row.timeSpent),
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
        lastAccessed: row.lastAccessed ? row.lastAccessed.toISOString() : null,
        ...(row.data || {}),
      };
      return acc;
    }, {});
  }
  const rows = getSqliteDb().prepare(
    'SELECT * FROM user_lesson_progress WHERE user_id = ?'
  ).all(userId);
  return rows.reduce((acc, row) => {
    acc[row.lesson_id] = {
      lessonId: row.lesson_id,
      completed: Boolean(row.completed),
      score: finiteStat(row.score),
      timeSpent: finiteStat(row.time_spent),
      completedAt: row.completed_at,
      lastAccessed: row.last_accessed,
      ...safeJsonParse(row.data_json, {}),
    };
    return acc;
  }, {});
}

async function getLessonProgressData(userId, lessonId) {
  const all = await getAllLessonProgressData(userId);
  return all[lessonId] || null;
}

function buildProgressStats(progressMap) {
  const rows = Object.values(progressMap || {});
  const totalLessons = rows.length;
  const completedRows = rows.filter((row) => row.completed);
  const completedLessons = completedRows.length;
  const totalScore = completedRows.reduce((sum, row) => sum + finiteStat(row.score), 0);
  const totalTimeSpent = rows.reduce((sum, row) => sum + finiteStat(row.timeSpent), 0);
  return {
    totalLessons,
    completedLessons,
    progressPercentage: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
    averageScore: completedLessons ? Math.round(totalScore / completedLessons) : 0,
    totalTimeSpent,
  };
}

async function saveChatMessageData(userId, message, isUser = true) {
  if (!validWalletAddress(userId)) throw new Error('Invalid wallet address');
  const text = String(message || '').trim().slice(0, 8000);
  if (!text) throw new Error('Message is required');
  const now = new Date();
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    const saved = await UserChatMessage.create({ userId, message: text, isUser: Boolean(isUser), createdAt: now });
    return String(saved._id);
  }
  const id = crypto.randomBytes(16).toString('hex');
  getSqliteDb().prepare(`
    INSERT INTO user_chat_messages (id, user_id, message, is_user, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, text, isUser ? 1 : 0, now.toISOString());
  return id;
}

async function getChatHistoryData(userId, limit = 50) {
  if (!validWalletAddress(userId)) throw new Error('Invalid wallet address');
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    const rows = await UserChatMessage.find({ userId })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
    return rows.reverse().map((row) => ({
      id: String(row._id),
      message: row.message,
      isUser: Boolean(row.isUser),
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    }));
  }
  return getSqliteDb().prepare(`
    SELECT * FROM (
      SELECT * FROM user_chat_messages
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    ) ORDER BY created_at ASC
  `).all(userId, safeLimit).map((row) => ({
    id: row.id,
    message: row.message,
    isUser: Boolean(row.is_user),
    createdAt: row.created_at,
  }));
}

async function savePracticeSessionData(userId, data = {}) {
  if (!validWalletAddress(userId)) throw new Error('Invalid wallet address');
  const now = new Date();
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    const saved = await UserPracticeSession.create({ userId, data, createdAt: now });
    return String(saved._id);
  }
  const id = crypto.randomBytes(16).toString('hex');
  getSqliteDb().prepare(`
    INSERT INTO user_practice_sessions (id, user_id, data_json, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, JSON.stringify(data), now.toISOString());
  return id;
}

async function getPracticeSessionsData(userId, limit = 10) {
  if (!validWalletAddress(userId)) throw new Error('Invalid wallet address');
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    const rows = await UserPracticeSession.find({ userId }).sort({ createdAt: -1 }).limit(safeLimit).lean();
    return rows.map((row) => ({
      id: String(row._id),
      ...(row.data || {}),
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    }));
  }
  return getSqliteDb().prepare(`
    SELECT * FROM user_practice_sessions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, safeLimit).map((row) => ({
    id: row.id,
    ...safeJsonParse(row.data_json, {}),
    createdAt: row.created_at,
  }));
}

function finiteStat(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function summarizePaperWallet(paperWallet) {
  const history = Array.isArray(paperWallet?.history) ? paperWallet.history.slice(0, 500) : [];
  const positions = paperWallet?.positions && typeof paperWallet.positions === 'object'
    ? paperWallet.positions
    : {};
  let realized = 0;
  let unrealized = 0;
  let volumeSol = 0;
  let wins = 0;
  let losses = 0;
  let trades = 0;

  history.forEach((item) => {
    const amount = Math.max(0, finiteStat(item?.sol));
    volumeSol += amount;
    if (item?.kind !== 'sell') return;
    trades++;
    const pnl = finiteStat(item?.pnlSol);
    realized += pnl;
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
  });

  Object.values(positions).slice(0, 250).forEach((position) => {
    const invested = Math.max(0, finiteStat(position?.investedSol));
    const entry = Math.max(0, finiteStat(position?.entryMcUsd));
    const current = Math.max(0, finiteStat(position?.lastMcUsd, entry));
    if (invested && entry && current) unrealized += invested * (current / entry - 1);
  });

  const closed = wins + losses;
  return {
    pnlSol: Math.max(-1000000, Math.min(1000000, realized + unrealized)),
    trades,
    wins,
    losses,
    winRate: closed ? (wins / closed) * 100 : 0,
    volumeSol: Math.max(0, Math.min(100000000, volumeSol)),
    balanceSol: Math.max(0, Math.min(100000000, finiteStat(paperWallet?.balanceSol))),
    updatedAt: new Date(),
  };
}

async function updateWalletStats(walletAddress, stats) {
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    return WalletUser.findOneAndUpdate(
      { walletAddress },
      { $set: { stats } },
      { new: true }
    ).lean();
  }
  const result = getSqliteDb().prepare(`
    UPDATE wallet_users SET
      pnl_sol = ?, trades = ?, wins = ?, losses = ?, win_rate = ?,
      volume_sol = ?, balance_sol = ?, stats_updated_at = ?, updated_at = ?
    WHERE wallet_address = ?
  `).run(
    stats.pnlSol, stats.trades, stats.wins, stats.losses, stats.winRate,
    stats.volumeSol, stats.balanceSol, stats.updatedAt.toISOString(),
    stats.updatedAt.toISOString(), walletAddress
  );
  return result.changes ? getWalletUser(walletAddress) : null;
}

async function listLeaderboardUsers(limit) {
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    return WalletUser.find({ 'stats.updatedAt': { $ne: null } })
      .sort({ 'stats.pnlSol': -1, 'stats.winRate': -1, 'stats.trades': -1 })
      .limit(limit)
      .lean();
  }
  return getSqliteDb().prepare(`
    SELECT * FROM wallet_users
    WHERE stats_updated_at IS NOT NULL
    ORDER BY pnl_sol DESC, win_rate DESC, trades DESC
    LIMIT ?
  `).all(limit).map(sqliteUser);
}

function normalizedPaperTradeEvents(walletAddress, paperWallet) {
  const now = Date.now();
  return (Array.isArray(paperWallet?.history) ? paperWallet.history : [])
    .slice(0, 500)
    .map((item) => {
      const tradedAtMs = Number(item?.at);
      if (!Number.isFinite(tradedAtMs) || tradedAtMs <= 0 || tradedAtMs > now + 5 * 60 * 1000) return null;
      const kind = item?.kind === 'sell' ? 'sell' : 'buy';
      const sol = Math.max(0, Math.min(100000000, finiteStat(item?.sol)));
      const fingerprint = [walletAddress, kind, tradedAtMs, sol, finiteStat(item?.pnlSol)].join('|');
      return {
        eventKey: crypto.createHash('sha256').update(fingerprint).digest('hex'),
        walletAddress,
        kind,
        sol,
        tradedAt: new Date(tradedAtMs),
      };
    })
    .filter(Boolean);
}

async function syncPaperTradeEvents(walletAddress, paperWallet) {
  const events = normalizedPaperTradeEvents(walletAddress, paperWallet);
  if (!events.length) return;
  await initWalletStore();
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    await PaperTradeEvent.bulkWrite(events.map((event) => ({
      updateOne: {
        filter: { eventKey: event.eventKey },
        update: { $setOnInsert: event },
        upsert: true,
      },
    })), { ordered: false });
    return;
  }
  const insert = getSqliteDb().prepare(`
    INSERT OR IGNORE INTO paper_trade_events
      (event_key, wallet_address, kind, sol, traded_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  events.forEach((event) => {
    insert.run(event.eventKey, event.walletAddress, event.kind, event.sol, event.tradedAt.toISOString());
  });
}

async function getDashboardStats() {
  await initWalletStore();
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    const [totalUsers, paperTrades, recent] = await Promise.all([
      WalletUser.countDocuments({}),
      PaperTradeEvent.countDocuments({}),
      PaperTradeEvent.aggregate([
        { $match: { tradedAt: { $gte: cutoff, $lte: now } } },
        { $group: {
          _id: null,
          volume24hSol: { $sum: '$sol' },
          activeWallets: { $addToSet: '$walletAddress' },
        } },
      ]),
    ]);
    return {
      totalUsers,
      paperTrades,
      volume24hSol: finiteStat(recent[0]?.volume24hSol),
      activeTraders: recent[0]?.activeWallets?.length || 0,
    };
  }
  const db = getSqliteDb();
  const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM wallet_users').get().count;
  const paperTrades = db.prepare('SELECT COUNT(*) AS count FROM paper_trade_events').get().count;
  const recent = db.prepare(`
    SELECT COALESCE(SUM(sol), 0) AS volume_24h_sol,
           COUNT(DISTINCT wallet_address) AS active_traders
    FROM paper_trade_events
    WHERE traded_at >= ? AND traded_at <= ?
  `).get(cutoff.toISOString(), now.toISOString());
  return {
    totalUsers: Number(totalUsers) || 0,
    paperTrades: Number(paperTrades) || 0,
    volume24hSol: finiteStat(recent.volume_24h_sol),
    activeTraders: Number(recent.active_traders) || 0,
  };
}

function decodeBase58(value) {
  if (typeof value !== 'string' || !value) throw new Error('Invalid base58 value');
  let number = 0n;
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error('Invalid base58 value');
    number = number * 58n + BigInt(digit);
  }
  let hex = number.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let bytes = number === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === '1') leadingZeroes++;
  if (leadingZeroes) bytes = Buffer.concat([Buffer.alloc(leadingZeroes), bytes]);
  return bytes;
}

function encodeBase58(bytes) {
  const buffer = Buffer.from(bytes);
  let number = buffer.length ? BigInt('0x' + buffer.toString('hex')) : 0n;
  let output = '';
  while (number > 0n) {
    output = BASE58_ALPHABET[Number(number % 58n)] + output;
    number /= 58n;
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) output = '1' + output;
  return output || '1';
}

function readShortVec(buffer, offset) {
  let value = 0;
  let shift = 0;
  let byte;
  do {
    if (offset >= buffer.length || shift > 21) throw new Error('Malformed transaction');
    byte = buffer[offset++];
    value |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return { value, offset };
}

function verifyOwnershipTransaction(serialized, expectedWallet, expectedMemo) {
  const tx = Buffer.from(serialized, 'base64');
  let cursor = readShortVec(tx, 0);
  if (cursor.value < 1) throw new Error('Transaction is not signed');
  const signatureOffset = cursor.offset;
  const messageOffset = signatureOffset + cursor.value * 64;
  if (messageOffset + 3 >= tx.length) throw new Error('Malformed transaction');
  const signature = tx.subarray(signatureOffset, signatureOffset + 64);
  const message = tx.subarray(messageOffset);

  // Registration uses a legacy transaction, whose first account is the fee payer/signer.
  if (message[0] & 0x80) throw new Error('Unsupported ownership transaction version');
  if (cursor.value !== 1 || message[0] !== 1 || message[1] !== 0 || message[2] !== 1) {
    throw new Error('Ownership proof contains unexpected signers or permissions');
  }
  cursor = readShortVec(message, 3);
  const accountCount = cursor.value;
  const accountStart = cursor.offset;
  const accountEnd = accountStart + accountCount * 32;
  if (!accountCount || accountEnd + 32 > message.length) throw new Error('Malformed transaction');
  const accountKeys = [];
  for (let i = 0; i < accountCount; i++) {
    accountKeys.push(message.subarray(accountStart + i * 32, accountStart + (i + 1) * 32));
  }
  if (encodeBase58(accountKeys[0]) !== expectedWallet) throw new Error('Signed wallet does not match');

  if (accountCount !== 2 || encodeBase58(accountKeys[1]) !== SOLANA_MEMO_PROGRAM) {
    throw new Error('Ownership proof contains unexpected accounts');
  }
  cursor = readShortVec(message, accountEnd + 32);
  if (cursor.value !== 1) throw new Error('Ownership proof must contain only the verification memo');
  let foundMemo = false;
  for (let i = 0; i < cursor.value; i++) {
    if (cursor.offset >= message.length) throw new Error('Malformed transaction');
    const programIndex = message[cursor.offset++];
    const accounts = readShortVec(message, cursor.offset);
    if (accounts.value !== 0) throw new Error('Ownership proof contains unexpected instruction accounts');
    cursor.offset = accounts.offset + accounts.value;
    const data = readShortVec(message, cursor.offset);
    cursor.offset = data.offset;
    const instructionData = message.subarray(cursor.offset, cursor.offset + data.value);
    cursor.offset += data.value;
    if (programIndex < accountKeys.length &&
        encodeBase58(accountKeys[programIndex]) === SOLANA_MEMO_PROGRAM &&
        instructionData.toString('utf8') === expectedMemo) {
      foundMemo = true;
    }
  }
  if (!foundMemo) throw new Error('Ownership challenge does not match');
  if (cursor.offset !== message.length) throw new Error('Ownership proof contains unexpected data');

  const rawPublicKey = decodeBase58(expectedWallet);
  if (rawPublicKey.length !== 32) throw new Error('Invalid wallet address');
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawPublicKey]);
  const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
  if (!crypto.verify(null, message, publicKey, signature)) throw new Error('Invalid wallet signature');
}

function validWalletAddress(address) {
  try { return decodeBase58(address).length === 32; } catch (_) { return false; }
}

function getSolanaRpcUrl() {
  if (process.env.SOLANA_RPC_URL) return process.env.SOLANA_RPC_URL;
  const heliusKey = process.env.HELIUS_API_KEY || process.env.HELIUS_KEY;
  if (heliusKey) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`;
  return 'https://api.mainnet-beta.solana.com';
}

async function getCreatorRewardPool(force = false) {
  // Keep the heavyweight Pump SDK out of serverless startup. Most routes do
  // not need it, and loading it eagerly can crash constrained function boots.
  const { OnlinePumpSdk } = require('@pump-fun/pump-sdk');
  const basePoolSol = Math.max(0, finiteStat(process.env.REWARD_POOL_BASE_SOL, 0.5));
  const sharePercent = Math.max(0, Math.min(100, finiteStat(process.env.CREATOR_REWARD_SHARE_PERCENT, 45)));
  const creatorWallet = String(process.env.PAPER_CREATOR_WALLET || '').trim();
  const cacheMs = Math.max(15000, finiteStat(process.env.CREATOR_REWARD_CACHE_MS, 60000));
  if (!creatorWallet) {
    return {
      configured: false,
      basePoolSol,
      creatorRewardsSol: 0,
      sharePercent,
      creatorRewardContributionSol: 0,
      totalPoolSol: basePoolSol,
      trackedAt: new Date().toISOString(),
    };
  }
  if (!validWalletAddress(creatorWallet)) throw new Error('PAPER_CREATOR_WALLET is not a valid Solana address');
  if (!force && creatorRewardCache && Date.now() - creatorRewardCache.cachedAt < cacheMs) {
    return creatorRewardCache.value;
  }
  const rpcUrl = getSolanaRpcUrl();
  const sdk = new OnlinePumpSdk(new Connection(rpcUrl, 'confirmed'));
  const timeoutMs = Math.max(3000, finiteStat(process.env.CREATOR_REWARD_RPC_TIMEOUT_MS, 10000));
  const lamports = await Promise.race([
    sdk.getCreatorVaultBalanceBothPrograms(new PublicKey(creatorWallet)),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('Creator reward RPC timed out')),
      timeoutMs
    )),
  ]);
  const creatorRewardsSol = Number(lamports.toString()) / LAMPORTS_PER_SOL;
  const creatorRewardContributionSol = creatorRewardsSol * (sharePercent / 100);
  const value = {
    configured: true,
    creatorWallet,
    tokenMint: String(process.env.PAPER_TOKEN_MINT || '').trim() || null,
    basePoolSol,
    creatorRewardsSol,
    sharePercent,
    creatorRewardContributionSol,
    totalPoolSol: basePoolSol + creatorRewardContributionSol,
    trackedAt: new Date().toISOString(),
  };
  creatorRewardCache = { cachedAt: Date.now(), value };
  return value;
}

// Legacy flat-file URLs → clean /pages/ URLs (no .html).
const LEGACY_PAGES = [
  'dashboard.html',
  'login.html',
  'paper-ai.html',
  'lycuem-course.html',
  'demo-trading.html',
  'demo-trading-terminal.html',
  'leaderboard.html',
  'user-stats.html',
];
LEGACY_PAGES.forEach((name) => {
  app.get('/' + name, (req, res) => {
    const slug = name.replace(/\.html$/, '');
    res.redirect(301, '/pages/' + slug);
  });
});

// /pages/foo.html → /pages/foo (preserve query string).
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const pathname = req.path || '';
  const m = pathname.match(/^(\/pages\/[^/]+)\.html$/);
  if (!m) return next();
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(301, m[1] + qs);
});

// Extensionless routes: /pages/login → pages/login.html
app.get('/pages/:page', (req, res, next) => {
  const { page } = req.params;
  if (!page || page.includes('.')) return next();
  const filePath = path.join(__dirname, 'pages', `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) {
      if (err.code === 'ENOENT') return next();
      return next(err);
    }
  });
});

app.use(express.static(path.join(__dirname)));

// Initialize OpenAI (fail gracefully so server still starts)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  console.warn('OPENAI_API_KEY is missing. /api/chat will return 500 until it is set.');
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_MINTS = {
  SOL: SOL_MINT,
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
};
const TOKEN_DECIMALS = {
  [SOL_MINT]: 9,
  [TOKEN_MINTS.USDC]: 6,
  [TOKEN_MINTS.USDT]: 6,
  [TOKEN_MINTS.BONK]: 5,
  [TOKEN_MINTS.WIF]: 6,
  [TOKEN_MINTS.JUP]: 6,
};

function resolveTokenMint(value) {
  const raw = String(value || '').trim().replace(/^\$/, '');
  if (!raw) return '';
  return TOKEN_MINTS[raw.toUpperCase()] || raw;
}

function normalizeSwapAmountForQuote(amount, inputMint) {
  const raw = String(amount || '').trim();
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return raw;
  if (/^\d+$/.test(raw) && numeric > 10000) return raw;
  const decimals = TOKEN_DECIMALS[inputMint] ?? 6;
  return String(Math.floor(numeric * Math.pow(10, decimals)));
}

// Solana tools/functions that the AI can call
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_price',
      description: 'Get the current price of a Solana token by symbol (e.g., SOL, USDC, BONK) or contract address (mint address)',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Token symbol (SOL, USDC, BONK) or contract address (mint address)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_token',
      description: 'Analyze a Solana token by its contract address (mint address). Returns price, volume, liquidity, holders, and risk assessment.',
      parameters: {
        type: 'object',
        properties: {
          mint: {
            type: 'string',
            description: 'The contract address (mint address) of the token to analyze',
          },
        },
        required: ['mint'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_swap_quote',
      description: 'Get a swap quote for trading between two tokens on Solana. Returns expected output amount, route, slippage, and fees. Does NOT execute the swap.',
      parameters: {
        type: 'object',
        properties: {
          inputMint: {
            type: 'string',
            description: 'The contract address (mint) of the input token. Use "So11111111111111111111111111111111111111112" for SOL',
          },
          outputMint: {
            type: 'string',
            description: 'The contract address (mint) of the output token. Use "So11111111111111111111111111111111111111112" for SOL',
          },
          amount: {
            type: 'string',
            description: 'The amount to swap (in the input token\'s smallest unit, e.g., lamports for SOL)',
          },
          slippageBps: {
            type: 'number',
            description: 'Slippage tolerance in basis points (100 = 1%). Default is 50 (0.5%)',
            default: 50,
          },
        },
        required: ['inputMint', 'outputMint', 'amount'],
      },
    },
  },
];

// System prompt for the AI
const SYSTEM_PROMPT = `You are a helpful Solana trading assistant. Your role is to:

1. Answer questions about Solana, trading, memecoins, and DeFi
2. Help users check token prices
3. Analyze tokens by contract address
4. Get swap quotes (but NEVER execute trades without explicit user confirmation)
5. Explain trading concepts in simple terms

IMPORTANT RULES:
- Always verify contract addresses before providing information
- When getting swap quotes, explain what will happen but ask for confirmation before executing
- Never execute transactions directly - always require user confirmation
- If a user asks to buy/sell, get a quote first and show them the details
- Be honest about risks, especially with memecoins
- Use the tools available to get real data, don't make up prices or information

SWAP LANGUAGE INTERPRETATIONS:
- "buy [token]" means swap SOL for that token. Use SOL as inputMint and the token mint/symbol as outputMint.
- "sell [token]" means swap that token for SOL. Use the token mint/symbol as inputMint and SOL as outputMint.
- "buy 0.1 SOL of [token]" means quote 0.1 SOL into that token.
- "swap 5 USDC to SOL" means quote 5 USDC into SOL, not SOL into SOL.
- Token identifiers can be symbols (SOL, USDC, USDT, BONK, WIF, JUP) or Solana mint addresses.
- Amount for get_swap_quote must always be in the input token's smallest unit: SOL lamports use 1e9; USDC/USDT/JUP/WIF use 1e6; BONK uses 1e5.
- For percentage sells like "sell half", "sell all", or "sell 50%", do not guess the raw amount unless a balance was provided. Ask the client to calculate from wallet balance or ask for an exact token amount.

Be friendly, helpful, and educational.`;

// Implement the actual tool functions
async function executeTool(toolName, args) {
  switch (toolName) {
    case 'get_price':
      return await getPrice(args.query);
    
    case 'analyze_token':
      return await analyzeToken(args.mint);
    
    case 'get_swap_quote':
      return await getSwapQuote(args.inputMint, args.outputMint, args.amount, args.slippageBps || 50);
    
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// Tool implementations
async function getPrice(query) {
  try {
    const mint = resolveTokenMint(query);

    // Use Jupiter API for price
    const response = await fetch(`https://price.jup.ag/v4/price?ids=${mint}`);
    const data = await response.json();

    if (data.data && data.data[mint]) {
      const priceData = data.data[mint];
      return {
        success: true,
        symbol: query,
        mint: mint,
        price: priceData.price,
        priceUsd: `$${priceData.price.toFixed(6)}`,
      };
    }

    // Fallback to CoinGecko for SOL
    if (query.toUpperCase() === 'SOL') {
      const cgResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const cgData = await cgResponse.json();
      if (cgData.solana) {
        return {
          success: true,
          symbol: 'SOL',
          price: cgData.solana.usd,
          priceUsd: `$${cgData.solana.usd.toFixed(2)}`,
        };
      }
    }

    return {
      success: false,
      error: 'Price not found. Please check the token symbol or contract address.',
    };
  } catch (error) {
    return {
      success: false,
      error: `Error fetching price: ${error.message}`,
    };
  }
}

async function analyzeToken(mint) {
  try {
    // Get price first
    const priceData = await getPrice(mint);
    
    // Get token info from Jupiter
    const response = await fetch(`https://token.jup.ag/strict`);
    const tokens = await response.json();
    const token = tokens.find(t => t.address === mint);

    // Basic analysis
    const analysis = {
      success: true,
      mint: mint,
      price: priceData.success ? priceData.priceUsd : 'N/A',
      name: token?.name || 'Unknown',
      symbol: token?.symbol || 'Unknown',
      decimals: token?.decimals || 9,
      warning: 'This is a basic analysis. Always do your own research (DYOR) before trading.',
      riskLevel: 'Unknown - Insufficient data',
    };

    // Add risk assessment based on available data
    if (!token) {
      analysis.riskLevel = 'High - Token not found in Jupiter registry';
      analysis.warning += ' Token may be new or potentially risky.';
    }

    return analysis;
  } catch (error) {
    return {
      success: false,
      error: `Error analyzing token: ${error.message}`,
    };
  }
}

async function getSwapQuote(inputMint, outputMint, amount, slippageBps) {
  try {
    const resolvedInputMint = resolveTokenMint(inputMint);
    const resolvedOutputMint = resolveTokenMint(outputMint);
    const normalizedAmount = normalizeSwapAmountForQuote(amount, resolvedInputMint);
    const params = new URLSearchParams({
      inputMint: resolvedInputMint,
      outputMint: resolvedOutputMint,
      amount: normalizedAmount,
      slippageBps: String(slippageBps),
      swapMode: 'ExactIn',
    });
    const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?${params.toString()}`;
    const response = await fetch(quoteUrl);
    let data;
    try {
      data = await response.json();
    } catch {
      return { success: false, error: 'Jupiter returned an invalid response' };
    }

    if (!response.ok || data.error || !data.outAmount) {
      return {
        success: false,
        error: data.error || data.message || 'No swap route found for this token pair',
      };
    }

    const outDecimals = TOKEN_DECIMALS[data.outputMint] ?? 6;

    return {
      success: true,
      inputMint: resolvedInputMint,
      outputMint: resolvedOutputMint,
      inputAmount: data.inAmount,
      outputAmount: data.outAmount,
      outputAmountFormatted: (parseInt(data.outAmount, 10) / Math.pow(10, outDecimals)).toFixed(6),
      priceImpact: data.priceImpactPct ? `${data.priceImpactPct}%` : 'N/A',
      route: data.routePlan || [],
      slippage: `${slippageBps / 100}%`,
      fees: '~$0.0025 (Solana network fee)',
      quoteResponse: data,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting swap quote: ${error.message}`,
    };
  }
}

function normalizePumpfunToken(coin) {
  if (!coin || typeof coin !== 'object') return null;
  const createdTimestamp =
    coin.created_timestamp ||
    coin.creationTime ||
    coin.createdTimestamp ||
    coin.createdAt ||
    coin.created_at ||
    null;
  return {
    mint: coin.mint || coin.coinMint || null,
    symbol: coin.symbol || coin.ticker || null,
    name: coin.name || null,
    image_uri: coin.image_uri || coin.imageUrl || null,
    usd_market_cap: coin.usd_market_cap || coin.usdMarketCap || coin.market_cap || coin.marketCap || null,
    volume_24h: coin.volume_24h || coin.volume24h || coin.total_volume || coin.volume || null,
    created_timestamp: createdTimestamp,
    twitter: coin.twitter || null,
    website: coin.website || coin.websiteUrl || coin.web || null,
    telegram: coin.telegram || coin.telegramUrl || coin.tg || null,
  };
}

function parsePumpfunTimestampMs(value) {
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      value = asNumber;
    } else {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  let timestamp = Number(value);
  if (timestamp > 0 && timestamp < 1000000000000) {
    timestamp *= 1000;
  }

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return timestamp;
}

function dedupePumpfunTokens(tokens) {
  const seen = new Set();
  return tokens.filter((token) => {
    const mint = String(token?.mint || '').trim();
    if (!mint || seen.has(mint)) return false;
    seen.add(mint);
    return true;
  });
}

function filterPumpfunTokens(tokens, options = {}) {
  const minMarketCap = Number(options.minMarketCap);
  const maxMarketCap = Number(options.maxMarketCap);
  const maxAgeSeconds = Number(options.maxAgeSeconds);
  const nowMs = Date.now();

  return tokens.filter((token) => {
    const createdMs = parsePumpfunTimestampMs(token?.created_timestamp);
    if (!createdMs) return false;

    const marketCap = Number(token?.usd_market_cap || token?.market_cap);
    if (Number.isFinite(minMarketCap) && (!Number.isFinite(marketCap) || marketCap < minMarketCap)) {
      return false;
    }
    if (Number.isFinite(maxMarketCap) && (!Number.isFinite(marketCap) || marketCap > maxMarketCap)) {
      return false;
    }

    if (Number.isFinite(maxAgeSeconds)) {
      const ageSeconds = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
      if (ageSeconds > maxAgeSeconds) return false;
    }

    return true;
  });
}

async function fetchLatestPumpfunTokens(limit = 120) {
  const requested = Math.max(1, Math.min(300, Number(limit) || 120));
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(requested / pageSize));
  const endpointBuilders = [
    (offset) => `https://frontend-api-v3.pump.fun/coins?offset=${offset}&limit=${pageSize}&sort=created_timestamp&order=DESC&includeNsfw=false`,
    (offset) => `https://advanced-api-v2.pump.fun/coins/list?offset=${offset}&limit=${pageSize}`,
  ];

  for (const buildUrl of endpointBuilders) {
    const allTokens = [];
    for (let page = 0; page < pageCount; page += 1) {
      const offset = page * pageSize;
      try {
        const response = await fetch(buildUrl(offset));
        if (!response.ok) break;
        const payload = await response.json();
        const rawTokens = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.coins)
            ? payload.coins
            : [];
        const normalizedTokens = rawTokens
          .map(normalizePumpfunToken)
          .filter((token) => token && token.mint && token.symbol && token.name);

        if (!normalizedTokens.length) break;
        allTokens.push(...normalizedTokens);

        if (rawTokens.length < pageSize) break;
      } catch {
        break;
      }
    }

    if (allTokens.length) {
      return dedupePumpfunTokens(allTokens).sort((a, b) => {
        const aCreated = parsePumpfunTimestampMs(a.created_timestamp) || 0;
        const bCreated = parsePumpfunTimestampMs(b.created_timestamp) || 0;
        return bCreated - aCreated;
      });
    }
  }

  return [];
}

// Proxy for paper-ai.js (browser): uses server OPENAI_API_KEY so the client never needs a key.
app.post('/api/openai-chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    if (!openai) {
      return res.status(500).json({
        error: 'Server is missing OPENAI_API_KEY. Add it in .env (local) or Vercel environment variables.',
      });
    }
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });
    const text = completion.choices[0]?.message?.content?.trim() || '';
    res.json({ text });
  } catch (error) {
    console.error('openai-chat error:', error);
    res.status(500).json({
      error: error.message || 'OpenAI request failed',
    });
  }
});

function getConfigStatus() {
  const mongoConfigured = hasMongoUri();
  const sqliteFallback = allowSqliteFallback();
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    helius: Boolean(process.env.HELIUS_API_KEY || process.env.HELIUS_KEY),
    solanaTracker: Boolean(
      process.env.SOLANA_TRACKER_API_KEY ||
      process.env.SOLANA_TRACKER_KEY ||
      process.env.SOLANATRACKER_API_KEY
    ),
    database: mongoConfigured ? 'mongodb' : (sqliteFallback ? 'sqlite-fallback' : 'unconfigured'),
    persistenceReady: mongoConfigured || sqliteFallback,
    mongoConfigured,
    sqliteFallback,
    rewards: Boolean(process.env.PAPER_CREATOR_WALLET && process.env.PAPER_TOKEN_MINT),
  };
}

// Non-secret client config (still treat as sensitive — anyone can call this URL).
// Provider configuration is reported as booleans; credentials never leave the server.
app.get('/api/paper-secrets', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({
    heliusConfigured: Boolean(process.env.HELIUS_API_KEY || process.env.HELIUS_KEY),
    solanaTrackerConfigured: Boolean(
      process.env.SOLANA_TRACKER_API_KEY ||
      process.env.SOLANA_TRACKER_KEY ||
      process.env.SOLANATRACKER_API_KEY
    ),
  });
});

app.get('/api/solana-tracker', async (req, res) => {
  try {
    const apiKey =
      process.env.SOLANA_TRACKER_API_KEY ||
      process.env.SOLANA_TRACKER_KEY ||
      process.env.SOLANATRACKER_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Solana Tracker is not configured' });
    const upstreamPath = String(req.query.path || '').trim();
    const allowedPath = /^\/(?:search|tokens\/(?:multi\/)?graduated|trades\/[1-9A-HJ-NP-Za-km-z]{32,44}|chart\/[1-9A-HJ-NP-Za-km-z]{32,44})$/;
    if (!allowedPath.test(upstreamPath)) return res.status(400).json({ error: 'Unsupported Solana Tracker route' });

    const upstream = new URL(`https://data.solanatracker.io${upstreamPath}`);
    Object.entries(req.query).forEach(([key, value]) => {
      if (key === 'path' || Array.isArray(value) || value == null) return;
      upstream.searchParams.set(key, String(value).slice(0, 200));
    });
    const response = await fetch(upstream, {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
    });
    const body = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'private, max-age=5');
    return res.send(body);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Solana Tracker request failed' });
  }
});

app.post('/api/helius/rpc', async (req, res) => {
  try {
    const apiKey = process.env.HELIUS_API_KEY || process.env.HELIUS_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Helius is not configured' });
    const method = String(req.body?.method || '');
    const allowedMethods = new Set([
      'getAsset',
      'getAssetBatch',
      'getAssetsByOwner',
      'getBalance',
      'getTokenAccountsByOwner',
      'getSignaturesForAddress',
      'getTransaction',
    ]);
    if (!allowedMethods.has(method)) return res.status(400).json({ error: 'Unsupported Helius method' });

    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: req.body?.id || 'paper-helius',
        method,
        params: req.body?.params && typeof req.body.params === 'object' ? req.body.params : [],
      }),
    });
    const body = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(body);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Helius RPC request failed' });
  }
});

app.get('/api/helius/transactions/:address', async (req, res) => {
  try {
    const apiKey = process.env.HELIUS_API_KEY || process.env.HELIUS_KEY;
    const address = String(req.params.address || '').trim();
    if (!apiKey) return res.status(503).json({ error: 'Helius is not configured' });
    if (!validWalletAddress(address)) return res.status(400).json({ error: 'Invalid wallet address' });

    const upstream = new URL(`https://api.helius.xyz/v0/addresses/${encodeURIComponent(address)}/transactions`);
    upstream.searchParams.set('api-key', apiKey);
    upstream.searchParams.set('limit', String(Math.max(1, Math.min(100, Number(req.query.limit) || 100))));
    if (req.query.before) upstream.searchParams.set('before', String(req.query.before).slice(0, 100));
    const response = await fetch(upstream, { headers: { accept: 'application/json' } });
    const body = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(body);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Helius transactions request failed' });
  }
});

app.get('/api/config-status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json(getConfigStatus());
});

app.get('/api/data/profile', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!validWalletAddress(userId)) return res.status(400).json({ error: 'Invalid wallet address' });
    return res.json({ profile: serializeProfile(await getWalletUser(userId)) });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Could not load profile' });
  }
});

app.post('/api/data/profile', async (req, res) => {
  try {
    const userId = String(req.body?.userId || req.body?.walletAddress || '').trim();
    const profile = await upsertUserProfile(userId, req.body?.profile || req.body || {});
    return res.json({ profile: serializeProfile(profile) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'Username is already taken' });
    return res.status(400).json({ error: error.message || 'Could not save profile' });
  }
});

app.get('/api/data/username-available', async (req, res) => {
  try {
    const username = String(req.query.username || '').trim();
    const userId = String(req.query.userId || '').trim();
    return res.json({ available: await isUsernameFree(username, userId) });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not check username' });
  }
});

app.patch('/api/data/profile/username', async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const username = String(req.body?.username || '').trim();
    if (!validWalletAddress(userId)) return res.status(400).json({ error: 'Invalid wallet address' });
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Use 2-24 letters, numbers, or underscores' });
    }
    if (!(await isUsernameFree(username, userId))) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    const existing = await getWalletUser(userId);
    const profile = await upsertUserProfile(userId, {
      username,
      walletName: existing?.walletName || req.body?.walletName || 'Wallet',
    });
    return res.json({ profile: serializeProfile(profile) });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not update username' });
  }
});

app.get('/api/data/lessons', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    res.json({ progress: await getAllLessonProgressData(userId) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not load lesson progress' });
  }
});

app.get('/api/data/lessons/:lessonId', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    res.json({ progress: await getLessonProgressData(userId, req.params.lessonId) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not load lesson progress' });
  }
});

app.post('/api/data/lessons/:lessonId', async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const progress = await saveLessonProgressData(userId, req.params.lessonId, req.body?.progress || {});
    res.json({ progress, stats: buildProgressStats(await getAllLessonProgressData(userId)) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not save lesson progress' });
  }
});

app.get('/api/data/stats', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    res.json({ stats: buildProgressStats(await getAllLessonProgressData(userId)) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not load stats' });
  }
});

app.get('/api/data/chat', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    res.json({ messages: await getChatHistoryData(userId, req.query.limit) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not load chat history' });
  }
});

app.post('/api/data/chat', async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const id = await saveChatMessageData(userId, req.body?.message, req.body?.isUser);
    res.status(201).json({ id });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not save chat message' });
  }
});

app.get('/api/data/practice-sessions', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    res.json({ sessions: await getPracticeSessionsData(userId, req.query.limit) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not load practice sessions' });
  }
});

app.post('/api/data/practice-sessions', async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const id = await savePracticeSessionData(userId, req.body?.session || {});
    res.status(201).json({ id });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not save practice session' });
  }
});

app.get('/api/rewards/pool', async (req, res) => {
  try {
    const pool = await getCreatorRewardPool(false);
    const total = pool.totalPoolSol;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.json({
      ...pool,
      prizes: {
        first: total * 0.6,
        second: total * 0.3,
        third: total * 0.1,
      },
    });
  } catch (error) {
    console.error('Creator reward tracking error:', error);
    return res.status(503).json({
      error: error.message || 'Could not read Pump.fun creator rewards',
      configured: Boolean(process.env.PAPER_CREATOR_WALLET),
      totalPoolSol: Math.max(0, finiteStat(process.env.REWARD_POOL_BASE_SOL, 0.5)),
    });
  }
});

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const stats = await getDashboardStats();
    const nextPayoutAt = new Date();
    nextPayoutAt.setUTCHours(24, 0, 0, 0);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.json({
      ...stats,
      updatedAt: new Date().toISOString(),
      nextPayoutAt: nextPayoutAt.toISOString(),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ error: error.message || 'Could not load dashboard stats' });
  }
});

app.get('/api/token/holders', async (req, res) => {
  try {
    const mint = String(req.query.mint || '').trim();
    if (!validWalletAddress(mint)) return res.status(400).json({ error: 'Invalid token mint' });

    const rpcUrl = getSolanaRpcUrl();
    const rpc = async (method, params) => {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: `paper-${method}`, method, params }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload?.error?.message || `${method} failed`);
      return payload.result;
    };

    const [largest, supplyResult] = await Promise.all([
      rpc('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]),
      rpc('getTokenSupply', [mint, { commitment: 'confirmed' }]),
    ]);
    const accounts = Array.isArray(largest?.value) ? largest.value.slice(0, 20) : [];
    const accountInfo = accounts.length
      ? await rpc('getMultipleAccounts', [
          accounts.map((account) => account.address),
          { encoding: 'jsonParsed', commitment: 'confirmed' },
        ])
      : { value: [] };
    const supply = Number(supplyResult?.value?.amount) || 0;
    const byOwner = new Map();

    accounts.forEach((account, index) => {
      const owner = String(accountInfo?.value?.[index]?.data?.parsed?.info?.owner || account.address || '').trim();
      const amount = Number(account.amount) || 0;
      if (!owner || amount <= 0) return;
      byOwner.set(owner, (byOwner.get(owner) || 0) + amount);
    });

    const holders = Array.from(byOwner.entries())
      .map(([owner, amount]) => ({
        owner,
        amount: String(amount),
        percentage: supply > 0 ? (amount / supply) * 100 : 0,
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 10);

    res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=30, stale-while-revalidate=60');
    return res.json({ mint, supply: String(supply), holders, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Token holders error:', error);
    return res.status(503).json({ error: error.message || 'Could not load token holders' });
  }
});

async function getLatestSolanaBlockhash() {
  const rpcUrl = getSolanaRpcUrl();
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'paper-wallet-auth',
      method: 'getLatestBlockhash',
      params: [{ commitment: 'finalized' }],
    }),
  });
  const payload = await response.json();
  const blockhash = payload?.result?.value?.blockhash;
  if (!response.ok || !blockhash) throw new Error(payload?.error?.message || 'Could not create wallet challenge');
  return blockhash;
}

app.get('/api/wallet/profile', async (req, res) => {
  try {
    const walletAddress = String(req.query.walletAddress || '').trim();
    if (!validWalletAddress(walletAddress)) return res.status(400).json({ error: 'Invalid wallet address' });
    const user = await getWalletUser(walletAddress);
    if (!user) return res.json({ registered: false });
    return res.json({
      registered: true,
      username: user.username,
      walletAddress: user.walletAddress,
      walletName: user.walletName,
    });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Could not load wallet profile' });
  }
});

app.post('/api/wallet/challenge', async (req, res) => {
  try {
    const walletAddress = String(req.body?.walletAddress || '').trim();
    const username = String(req.body?.username || '').trim();
    const usernameNormalized = username.toLowerCase();
    if (!validWalletAddress(walletAddress)) return res.status(400).json({ error: 'Invalid wallet address' });
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Use 2–24 letters, numbers, or underscores' });
    }
    const claimed = await findClaimedWalletUser(walletAddress, usernameNormalized);
    if (claimed?.walletAddress === walletAddress) {
      return res.status(409).json({ error: 'This wallet is already registered', code: 'WALLET_TAKEN' });
    }
    if (claimed) return res.status(409).json({ error: 'That username is already taken', code: 'USERNAME_TAKEN' });

    const nonce = crypto.randomBytes(24).toString('hex');
    const memo = [
      'paper wallet ownership',
      `Nonce: ${nonce}`,
      `Wallet: ${walletAddress}`,
      `Username: ${usernameNormalized}`,
    ].join('\n');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const [recentBlockhash] = await Promise.all([
      getLatestSolanaBlockhash(),
      createWalletChallenge({ nonce, walletAddress, username, usernameNormalized, memo, expiresAt }),
    ]);
    return res.json({ nonce, memo, recentBlockhash, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('Wallet challenge error:', error);
    return res.status(503).json({ error: error.message || 'Could not create wallet challenge' });
  }
});

app.post('/api/wallet/register', async (req, res) => {
  try {
    const nonce = String(req.body?.nonce || '').trim();
    const signedTransaction = String(req.body?.signedTransaction || '');
    const walletName = String(req.body?.walletName || 'Wallet').trim().slice(0, 50) || 'Wallet';
    if (!nonce || !signedTransaction) return res.status(400).json({ error: 'Signed ownership proof is required' });
    if (signedTransaction.length > 10000) return res.status(413).json({ error: 'Ownership proof is too large' });
    // Claim the one-time challenge before verifying, preventing concurrent replay attempts.
    const challenge = await consumeWalletChallenge(nonce);
    if (!challenge) return res.status(400).json({ error: 'Challenge expired or already used' });

    verifyOwnershipTransaction(signedTransaction, challenge.walletAddress, challenge.memo);
    const user = await createWalletUser({
      walletAddress: challenge.walletAddress,
      username: challenge.username,
      usernameNormalized: challenge.usernameNormalized,
      walletName,
    });
    return res.status(201).json({
      username: user.username,
      walletAddress: user.walletAddress,
      walletName: user.walletName,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const walletTaken = Boolean(error.keyPattern?.walletAddress);
      return res.status(409).json({
        error: walletTaken ? 'This wallet is already registered' : 'That username is already taken',
        code: walletTaken ? 'WALLET_TAKEN' : 'USERNAME_TAKEN',
      });
    }
    console.error('Wallet registration error:', error);
    return res.status(400).json({ error: error.message || 'Wallet registration failed' });
  }
});

app.post('/api/leaderboard/sync', async (req, res) => {
  try {
    const walletAddress = String(req.body?.walletAddress || '').trim();
    if (!validWalletAddress(walletAddress)) return res.status(400).json({ error: 'Invalid wallet address' });
    if (!req.body?.paperWallet || typeof req.body.paperWallet !== 'object') {
      return res.status(400).json({ error: 'Paper wallet data is required' });
    }
    const registered = await getWalletUser(walletAddress);
    if (!registered) return res.status(403).json({ error: 'Register a username before joining the leaderboard' });
    const stats = summarizePaperWallet(req.body.paperWallet);
    await Promise.all([
      updateWalletStats(walletAddress, stats),
      syncPaperTradeEvents(walletAddress, req.body.paperWallet),
    ]);
    return res.json({ success: true, stats });
  } catch (error) {
    console.error('Leaderboard sync error:', error);
    return res.status(500).json({ error: error.message || 'Could not sync leaderboard stats' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const users = await listLeaderboardUsers(limit);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.json({
      updatedAt: new Date().toISOString(),
      traders: users.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        walletAddress: user.walletAddress,
        pnlSol: finiteStat(user.stats?.pnlSol),
        trades: Math.max(0, Math.floor(finiteStat(user.stats?.trades))),
        wins: Math.max(0, Math.floor(finiteStat(user.stats?.wins))),
        losses: Math.max(0, Math.floor(finiteStat(user.stats?.losses))),
        winRate: Math.max(0, Math.min(100, finiteStat(user.stats?.winRate))),
        volumeSol: Math.max(0, finiteStat(user.stats?.volumeSol)),
        statsUpdatedAt: user.stats?.updatedAt || null,
      })),
    });
  } catch (error) {
    console.error('Leaderboard read error:', error);
    return res.status(500).json({ error: error.message || 'Could not load leaderboard' });
  }
});

app.post('/api/jupiter/quote', async (req, res) => {
  try {
    const { inputMint, outputMint, amount, slippageBps = 100 } = req.body || {};
    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({ success: false, error: 'inputMint, outputMint, and amount are required' });
    }
    const result = await getSwapQuote(inputMint, outputMint, String(amount), Number(slippageBps) || 100);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Quote failed' });
  }
});

app.post('/api/jupiter/swap-tx', async (req, res) => {
  try {
    const { quoteResponse, userPublicKey } = req.body || {};
    if (!quoteResponse || !userPublicKey) {
      return res.status(400).json({ success: false, error: 'quoteResponse and userPublicKey are required' });
    }
    const response = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      return res.status(400).json({
        success: false,
        error: data.error || data.message || 'Jupiter swap build failed',
      });
    }
    res.json({
      success: true,
      swapTransaction: data.swapTransaction,
      lastValidBlockHeight: data.lastValidBlockHeight,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Swap tx build failed' });
  }
});

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!openai) {
      return res.status(500).json({
        error: 'Server is missing OPENAI_API_KEY. Create a .env file in the project root with OPENAI_API_KEY=... and restart the server.'
      });
    }

    // Build messages array
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    // Call OpenAI with function calling
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using gpt-4o-mini for cost efficiency, can upgrade to gpt-4o
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
    });

    const assistantMessage = completion.choices[0].message;
    let finalResponse = assistantMessage.content || '';
    let requiresConfirmation = false;
    let confirmationData = null;

    // If the model wants to call a tool
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCalls = assistantMessage.tool_calls;
      const toolResults = [];

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(toolName, toolArgs);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: JSON.stringify(result),
        });
      }

      // Second API call with tool results
      const secondMessages = [
        ...messages,
        assistantMessage,
        ...toolResults,
      ];

      const secondCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: secondMessages,
        tools: tools,
        tool_choice: 'auto',
      });

      const secondMessage = secondCompletion.choices[0].message;
      finalResponse = secondMessage.content || '';

      // Check if this is a swap request that needs confirmation
      if (toolCalls.some(tc => tc.function.name === 'get_swap_quote')) {
        const swapCall = toolCalls.find(tc => tc.function.name === 'get_swap_quote');
        if (swapCall) {
          const swapArgs = JSON.parse(swapCall.function.arguments);
          const swapResult = toolResults.find(tr => tr.name === 'get_swap_quote');
          if (swapResult && JSON.parse(swapResult.content).success) {
            requiresConfirmation = true;
            confirmationData = {
              action: 'swap',
              inputMint: swapArgs.inputMint,
              outputMint: swapArgs.outputMint,
              amount: swapArgs.amount,
              ...JSON.parse(swapResult.content),
            };
          }
        }
      }
    }

    res.json({
      response: finalResponse,
      requiresConfirmation: requiresConfirmation,
      confirmationData: confirmationData,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while processing your request',
    });
  }
});

app.get('/api/pumpfun/new', async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit) || 120;
    const tokens = await fetchLatestPumpfunTokens(requestedLimit);
    if (!tokens.length) {
      return res.status(503).json({ error: 'Unable to fetch Pump.fun tokens right now', tokens: [] });
    }

    const filteredTokens = filterPumpfunTokens(tokens, {
      minMarketCap: req.query.minMarketCap,
      maxMarketCap: req.query.maxMarketCap,
      maxAgeSeconds: req.query.maxAgeSeconds,
    }).slice(0, Math.max(1, Math.min(50, requestedLimit)));

    res.json({ tokens: filteredTokens });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Pump.fun fetch failed', tokens: [] });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Vercel serverless runs this file without listening; local dev uses app.listen.
module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Config status: ${JSON.stringify(getConfigStatus())}`);
  });
}
