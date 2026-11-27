-- E-posta yerine kullanıcı adı; kayıt yalnızca yönetim arayüzünden (davetler kaldırıldı).
ALTER TABLE users RENAME COLUMN email TO username;
DROP TABLE IF EXISTS invites;

-- Not ekleri: dosya diskte (ATTACHMENTS_DIR/<ilk 2 karakter>/<id>), kaydı burada.
CREATE TABLE attachments (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  mime       text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_user ON attachments(user_id, created_at);
