#!/usr/bin/env node
/**
 * init-db.js
 * fishing-spots.db の初期化（冪等）
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fishing-spots.db');

function initDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 冪等: DROP → CREATE
  db.exec(`
    DROP TABLE IF EXISTS catch_info;
    DROP TABLE IF EXISTS scraping_logs;
    DROP TABLE IF EXISTS spot_regulations;
    DROP TABLE IF EXISTS spots;

    CREATE TABLE spots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      prefecture TEXT,
      lat REAL,
      lon REAL,
      spot_type TEXT,
      facing REAL,
      shelter REAL,
      depth TEXT,
      bottom TEXT,
      footing TEXT,
      night_light INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE spot_regulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spot_id INTEGER REFERENCES spots(id),
      spot_name TEXT NOT NULL,
      prefecture TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      source_url TEXT,
      source_name TEXT,
      reliability TEXT DEFAULT '高',
      confirmed_at TEXT,
      is_current INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE scraping_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      url TEXT,
      status TEXT,
      records_found INTEGER DEFAULT 0,
      records_new INTEGER DEFAULT 0,
      error_message TEXT,
      scraped_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE catch_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spot_id INTEGER REFERENCES spots(id),
      fish_name TEXT,
      season_start INTEGER,
      season_end INTEGER,
      recommended_rig TEXT,
      source_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_spots_name ON spots(name);
    CREATE INDEX idx_spots_prefecture ON spots(prefecture);
    CREATE INDEX idx_regulations_spot_id ON spot_regulations(spot_id);
    CREATE INDEX idx_regulations_current ON spot_regulations(is_current);
    CREATE INDEX idx_scraping_logs_source ON scraping_logs(source);
  `);

  console.log('fishing-spots.db 初期化完了');

  // テーブル一覧確認
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('テーブル:', tables.map(t => t.name).join(', '));

  db.close();
}

initDb();
