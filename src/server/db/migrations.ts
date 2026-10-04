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
  {
    version: 4,
    name: "series_uploads",
    rebuildsTables: true,
    sql: `
      -- Series (ADR-0008): a universe shared by several books — characters with their
      -- references, illustration style, writing rules, default format and typography.
      CREATE TABLE series (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        illustration_style TEXT NOT NULL DEFAULT '',
        writing_rules TEXT NOT NULL DEFAULT '',
        quote_style TEXT CHECK (quote_style IN ('guillemets', 'none', 'dashes', 'english')),
        forbidden_words TEXT NOT NULL DEFAULT '[]',   -- JSON [{ word, use? }]
        language TEXT NOT NULL DEFAULT 'fr',
        age_min INTEGER,
        age_max INTEGER,
        format TEXT,
        typography TEXT,                              -- JSON, NULL = defaults
        words_per_spread INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_type TEXT NOT NULL,
        updated_by_name TEXT NOT NULL,
        archived_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );

      -- A book may belong to a series and adds its own style and rules to the series' ones.
      ALTER TABLE books ADD COLUMN series_id TEXT REFERENCES series(id) ON DELETE SET NULL;
      ALTER TABLE books ADD COLUMN illustration_style TEXT NOT NULL DEFAULT '';
      ALTER TABLE books ADD COLUMN writing_rules TEXT NOT NULL DEFAULT '';
      ALTER TABLE books ADD COLUMN quote_style TEXT CHECK (quote_style IN ('guillemets', 'none', 'dashes', 'english'));
      ALTER TABLE books ADD COLUMN forbidden_words TEXT NOT NULL DEFAULT '[]';
      CREATE INDEX books_series ON books(series_id);

      -- A character belongs to a book or to a series (shared by its books, not copied).
      CREATE TABLE characters_new (
        id TEXT PRIMARY KEY,
        book_id TEXT REFERENCES books(id) ON DELETE CASCADE,
        series_id TEXT REFERENCES series(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        appearance TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_type TEXT NOT NULL,
        updated_by_name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        CHECK ((book_id IS NULL) != (series_id IS NULL))
      );
      INSERT INTO characters_new (id, book_id, series_id, position, name, role, appearance, created_at, updated_at, updated_by_type, updated_by_name, version)
        SELECT id, book_id, NULL, position, name, role, appearance, created_at, updated_at, updated_by_type, updated_by_name, version FROM characters;
      DROP TABLE characters;
      ALTER TABLE characters_new RENAME TO characters;
      CREATE INDEX characters_book ON characters(book_id, position);
      CREATE INDEX characters_series ON characters(series_id, position);

      -- Normalised view of a reference image: front, side_right, side_left, back, face,
      -- three_quarter, sheet, expression:<name>, other ('' = inferred from the label).
      ALTER TABLE character_images ADD COLUMN view TEXT NOT NULL DEFAULT '';

      -- History of a series (book_id NULL) next to the books'; details = JSON (which image, which target).
      CREATE TABLE activity_new (
        id TEXT PRIMARY KEY,
        book_id TEXT REFERENCES books(id) ON DELETE CASCADE,
        series_id TEXT REFERENCES series(id) ON DELETE CASCADE,
        spread_id TEXT,
        character_id TEXT,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'agent')),
        actor_name TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        snapshot TEXT,
        details TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO activity_new (id, book_id, series_id, spread_id, character_id, actor_type, actor_name, action, summary, snapshot, details, created_at, updated_at)
        SELECT id, book_id, NULL, spread_id, character_id, actor_type, actor_name, action, summary, snapshot, NULL, created_at, updated_at FROM activity;
      DROP TABLE activity;
      ALTER TABLE activity_new RENAME TO activity;
      CREATE INDEX activity_book ON activity(book_id, updated_at);
      CREATE INDEX activity_series ON activity(series_id, updated_at);

      -- Direct uploads (ADR-0008): a single-use signed URL the agent PUTs a local file to,
      -- then a commit attaches it to its target. Processed on receipt (asset_id).
      CREATE TABLE uploads (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('spread_illustration', 'cover', 'character_image', 'image')),
        book_id TEXT REFERENCES books(id) ON DELETE CASCADE,
        series_id TEXT REFERENCES series(id) ON DELETE CASCADE,
        target_id TEXT,                    -- spread or character
        filename TEXT NOT NULL,
        content_type TEXT,
        options TEXT NOT NULL DEFAULT '{}', -- JSON: label, view, primary
        auto_commit INTEGER NOT NULL DEFAULT 0,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'agent')),
        actor_name TEXT NOT NULL,
        actor_scope TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        received_at TEXT,
        asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
        committed_at TEXT,
        result TEXT,                       -- JSON outcome of the commit
        CHECK (book_id IS NOT NULL OR series_id IS NOT NULL)
      );
      CREATE INDEX uploads_created ON uploads(created_at);
    `,
  },
  {
    version: 5,
    name: "shares",
    sql: `
      -- Reading links (ADR-0009): a book shown read-only, without an account, to whoever has
      -- the link. The token stays readable so the owner can copy the link again; it opens
      -- one book in the viewer and nothing else.
      CREATE TABLE shares (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        created_by_type TEXT NOT NULL CHECK (created_by_type IN ('human', 'agent')),
        created_by_name TEXT NOT NULL,
        expires_at TEXT,                   -- NULL = until revoked
        last_viewed_at TEXT,
        view_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX shares_book ON shares(book_id);
    `,
  },
];
