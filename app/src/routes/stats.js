const express = require('express');

// Data untuk halaman dashboard statistik
module.exports = function statsRoutes({ pool }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const uid = req.user.id;
    const [summary, byPriority, byCategory, daily, upcoming] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'todo')::int AS todo,
                COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
                COUNT(*) FILTER (WHERE status = 'done')::int AS done,
                COUNT(*) FILTER (WHERE status <> 'done' AND due_date < CURRENT_DATE)::int AS overdue,
                COUNT(*) FILTER (WHERE status <> 'done' AND due_date = CURRENT_DATE)::int AS due_today,
                COUNT(*) FILTER (WHERE status = 'done' AND completed_at >= date_trunc('week', now()))::int AS done_this_week
           FROM tasks WHERE user_id = $1`,
        [uid],
      ),
      pool.query(
        `SELECT p.priority,
                COUNT(t.id) FILTER (WHERE t.status <> 'done')::int AS open,
                COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done
           FROM (VALUES ('high'), ('medium'), ('low')) AS p(priority)
           LEFT JOIN tasks t ON t.priority = p.priority AND t.user_id = $1
          GROUP BY p.priority
          ORDER BY CASE p.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
        [uid],
      ),
      pool.query(
        `SELECT COALESCE(c.name, 'Tanpa kategori') AS name, COALESCE(c.color, '#94a3b8') AS color,
                COUNT(t.id)::int AS total,
                COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done
           FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = $1
          GROUP BY c.id, c.name, c.color
          ORDER BY total DESC`,
        [uid],
      ),
      // Jumlah tugas dibuat & diselesaikan per hari selama 14 hari terakhir
      pool.query(
        `SELECT to_char(d, 'YYYY-MM-DD') AS date,
                (SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND created_at::date = d)::int AS created,
                (SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND completed_at::date = d)::int AS completed
           FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') AS d
          ORDER BY d`,
        [uid],
      ),
      pool.query(
        `SELECT id, title, priority, due_date, (due_date < CURRENT_DATE) AS is_overdue
           FROM tasks
          WHERE user_id = $1 AND status <> 'done' AND due_date IS NOT NULL AND due_date <= CURRENT_DATE + 7
          ORDER BY due_date, id LIMIT 8`,
        [uid],
      ),
    ]);

    const s = summary.rows[0];
    res.json({
      summary: { ...s, completion_rate: s.total ? Math.round((s.done / s.total) * 100) : 0 },
      by_priority: byPriority.rows,
      by_category: byCategory.rows,
      daily: daily.rows,
      upcoming: upcoming.rows,
    });
  });

  return router;
};
