import aiosqlite
import bcrypt
from pathlib import Path
from config import settings

TABLES_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT DEFAULT 'key',
    ssh_key_path TEXT,
    password TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS image_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    application TEXT,
    image_name TEXT,
    image_tag TEXT,
    target_nodes TEXT,
    status TEXT NOT NULL,
    loaded_by TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manifests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    namespace TEXT DEFAULT 'default',
    kind TEXT NOT NULL,
    content_yaml TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    updated_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manifest_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manifest_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    content_yaml TEXT NOT NULL,
    updated_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (manifest_id) REFERENCES manifests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    resource_type TEXT,
    resource_name TEXT,
    namespace TEXT,
    severity TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    created_by TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS deploy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    resource_kind TEXT,
    resource_name TEXT,
    namespace TEXT,
    manifest_id INTEGER,
    before_yaml TEXT,
    after_yaml TEXT,
    deployed_by TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    filters_json TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL
);
"""


async def get_db() -> aiosqlite.Connection:
    db_path = Path(settings.DB_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(db_path))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    db = await get_db()
    try:
        await db.executescript(TABLES_SQL)

        cursor = await db.execute("PRAGMA table_info(image_history)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "application" not in columns:
            await db.execute("ALTER TABLE image_history ADD COLUMN application TEXT")

        cursor = await db.execute("SELECT COUNT(*) FROM users WHERE username = 'admin'")
        row = await cursor.fetchone()
        if row[0] == 0:
            from datetime import datetime, timezone
            password_hash = bcrypt.hashpw(settings.ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
            await db.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                ("admin", password_hash, datetime.now(timezone.utc).isoformat()),
            )
        await db.commit()
    finally:
        await db.close()
