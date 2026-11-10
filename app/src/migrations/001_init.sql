-- Skema awal TodoKu v2

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE categories (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  color      CHAR(7) NOT NULL DEFAULT '#4f46e5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_user_name_unique ON categories (user_id, lower(name));

CREATE TABLE tasks (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title        VARCHAR(200) NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       VARCHAR(20) NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo', 'in_progress', 'done')),
  priority     VARCHAR(10) NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low', 'medium', 'high')),
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_user_status_idx ON tasks (user_id, status);
CREATE INDEX tasks_user_due_idx ON tasks (user_id, due_date);

CREATE TABLE attachments (
  id            SERIAL PRIMARY KEY,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(100) NOT NULL UNIQUE,
  mime_type     VARCHAR(150) NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attachments_task_idx ON attachments (task_id);
