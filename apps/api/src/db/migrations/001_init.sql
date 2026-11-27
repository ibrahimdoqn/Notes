-- Cam Notlar ilk şema. Kimlikler istemcide üretilen UUIDv7'dir.

CREATE TABLE users (
  id            uuid PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL DEFAULT '',
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  platform     text NOT NULL CHECK (platform IN ('web', 'android')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  push_token   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_user ON devices(user_id);

CREATE TABLE sessions (
  id                uuid PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id         uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  refresh_hash      text NOT NULL,
  prev_refresh_hash text,
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sessions_refresh ON sessions(refresh_hash);
CREATE INDEX sessions_prev_refresh ON sessions(prev_refresh_hash);
CREATE INDEX sessions_device ON sessions(device_id);

CREATE TABLE invites (
  code_hash  text PRIMARY KEY,
  email      text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

CREATE TABLE folders (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX folders_user ON folders(user_id);

CREATE TABLE notes (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id      uuid REFERENCES folders(id) ON DELETE SET NULL,
  html           text NOT NULL DEFAULT '',
  title          text NOT NULL DEFAULT '',
  snippet        text NOT NULL DEFAULT '',
  plain_text     text NOT NULL DEFAULT '',
  pinned         boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  trashed_at     timestamptz,
  deleted_at     timestamptz,
  version        integer NOT NULL DEFAULT 1,
  base_version   integer NOT NULL DEFAULT 0,
  last_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);
CREATE INDEX notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX notes_user_folder ON notes(user_id, folder_id);
CREATE INDEX notes_search ON notes USING GIN (to_tsvector('turkish', title || ' ' || plain_text));

CREATE TABLE note_revisions (
  id         uuid PRIMARY KEY,
  note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  html       text NOT NULL,
  title      text NOT NULL DEFAULT '',
  version    integer NOT NULL,
  device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX note_revisions_note ON note_revisions(note_id, version DESC);

CREATE TABLE user_settings (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}',
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE change_log (
  seq        bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity     text NOT NULL CHECK (entity IN ('note', 'folder', 'settings')),
  entity_id  uuid NOT NULL,
  version    integer NOT NULL,
  op         text NOT NULL CHECK (op IN ('upsert', 'delete')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_log_user_seq ON change_log(user_id, seq);
