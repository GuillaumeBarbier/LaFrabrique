// Numbered, append-only migrations (ADR-0001). Never edit a shipped migration: add a new one.

export interface Migration {
  version: number;
  name: string;
  sql: string;
  /** Rebuilds a table other tables point to: run with foreign keys off, checked before commit. */
  rebuildsTables?: boolean;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,               -- sha256 of the cookie token
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        user_agent TEXT
      );
      CREATE INDEX sessions_user ON sessions(user_id);

      CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,              -- first characters, shown to recognise the key
        key_hash TEXT NOT NULL UNIQUE,     -- sha256 of the full key
        scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('illustration', 'cover', 'font')),
        book_id TEXT,
        original_name TEXT,
        mime TEXT NOT NULL,
        ext TEXT NOT NULL,
        size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by_type TEXT NOT NULL,
        created_by_name TEXT NOT NULL
      );

      CREATE TABLE fonts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        asset_id TEXT NOT NULL REFERENCES assets(id),
        format TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        illustrator TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT 'fr',
        age_min INTEGER,
        age_max INTEGER,
        status TEXT NOT NULL DEFAULT 'idea'
          CHECK (status IN ('idea', 'writing', 'illustrating', 'review', 'done')),
        format TEXT NOT NULL,
        cover_asset_id TEXT REFERENCES assets(id),
        typography TEXT NOT NULL,          -- JSON, see Typography in src/lib/book.ts
        brief TEXT NOT NULL DEFAULT '',
        words_per_spread INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE spreads (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        illustration_asset_id TEXT REFERENCES assets(id),
        illustration_brief TEXT NOT NULL DEFAULT '',
        illustration_fit TEXT NOT NULL DEFAULT 'cover' CHECK (illustration_fit IN ('cover', 'contain')),
        notes TEXT NOT NULL DEFAULT '',
        text_align TEXT CHECK (text_align IN ('left', 'center', 'right')),
        text_valign TEXT CHECK (text_valign IN ('top', 'middle', 'bottom')),
        text_size_pt REAL,
        page_color TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_type TEXT NOT NULL,
        updated_by_name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX spreads_book ON spreads(book_id, position);

      CREATE TABLE comments (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        spread_id TEXT,                    -- no FK: a thread survives its spread's deletion
        parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
        author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')),
        author_name TEXT NOT NULL,
        body TEXT NOT NULL,
        addressed_to TEXT CHECK (addressed_to IN ('human', 'agent')),
        resolved_at TEXT,
        resolved_by TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX comments_book ON comments(book_id, created_at);

      CREATE TABLE activity (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        spread_id TEXT,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'agent')),
        actor_name TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        snapshot TEXT,                     -- JSON state *before* the change, for restore
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX activity_book ON activity(book_id, updated_at);
    `,
  },
  {
    version: 2,
    name: "characters",
    rebuildsTables: true,
    sql: `
      -- Reference images of characters are assets too: widen the allowed kinds.
      CREATE TABLE assets_new (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('illustration', 'cover', 'font', 'character')),
        book_id TEXT,
        original_name TEXT,
        mime TEXT NOT NULL,
        ext TEXT NOT NULL,
        size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by_type TEXT NOT NULL,
        created_by_name TEXT NOT NULL
      );
      INSERT INTO assets_new SELECT * FROM assets;
      DROP TABLE assets;
      ALTER TABLE assets_new RENAME TO assets;

      CREATE TABLE characters (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        appearance TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_type TEXT NOT NULL,
        updated_by_name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX characters_book ON characters(book_id, position);

      CREATE TABLE character_images (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES assets(id),
        label TEXT NOT NULL DEFAULT '',
        is_primary INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        created_by_type TEXT NOT NULL,
        created_by_name TEXT NOT NULL
      );
      CREATE INDEX character_images_character ON character_images(character_id, position);

      -- Characters present on a spread: JSON array of ids, versioned and restored with the spread.
      ALTER TABLE spreads ADD COLUMN character_ids TEXT NOT NULL DEFAULT '[]';

      -- History of a character's sheet, next to the spread's.
      ALTER TABLE activity ADD COLUMN character_id TEXT;

      -- Server-side settings (signing secret of temporary links…).
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 3,
    name: "oauth",
    sql: `
      -- OAuth 2.1 for MCP connectors (ADR-0007). A client is registered (DCR) or identified by
      -- the URL of its metadata document (CIMD); a grant is one consented connection, i.e. one
      -- agent with a name and a scope; tokens are stored hashed.
      CREATE TABLE oauth_clients (
        id TEXT PRIMARY KEY,               -- client_id: random (DCR) or https URL (CIMD)
        name TEXT NOT NULL,
        redirect_uris TEXT NOT NULL,       -- JSON array
        secret_hash TEXT,                  -- confidential DCR clients only
        kind TEXT NOT NULL CHECK (kind IN ('dcr', 'cimd')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE oauth_codes (
        hash TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
        name TEXT NOT NULL,
        resource TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        grant_id TEXT                      -- set at exchange: a replayed code revokes it
      );

      CREATE TABLE oauth_grants (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
        client_name TEXT NOT NULL,
        redirect_host TEXT NOT NULL,
        name TEXT NOT NULL,                -- signs the agent's changes
        scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
        resource TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE oauth_tokens (
        hash TEXT PRIMARY KEY,
        grant_id TEXT NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT                       -- refresh tokens rotate: used once
      );
      CREATE INDEX oauth_tokens_grant ON oauth_tokens(grant_id);
    `,
  },
];
