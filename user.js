// controllers/user.js
const db = require('../../config/database');

// GET /api/users/profile
exports.getProfile = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, name, email, phone, state, city, class, category, income, profile_pic, is_verified, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/users/profile
exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, state, city, class: cls, category, income } = req.body;
        await db.query(
            `UPDATE users SET name=?, phone=?, state=?, city=?, class=?, category=?, income=? WHERE id=?`,
            [name, phone, state, city, cls, category, income, req.user.id]
        );
        res.json({ success: true, message: 'Profile updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/users/scholarships
exports.getScholarships = async (req, res) => {
    try {
        const { state, category, class: cls, search } = req.query;
        let query = `SELECT * FROM scholarships WHERE status = 'active'`;
        const params = [];

        if (state)    { query += ' AND (state = ? OR state IS NULL)'; params.push(state); }
        if (category) { query += ' AND (category = ? OR category = "All")'; params.push(category); }
        if (cls)      { query += ' AND class_level LIKE ?'; params.push(`%${cls}%`); }
        if (search)   { query += ' AND MATCH(title, description) AGAINST(? IN BOOLEAN MODE)'; params.push(search + '*'); }

        query += ' ORDER BY last_date ASC';

        const [rows] = await db.query(query, params);
        res.json({ success: true, scholarships: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/users/applications
exports.getApplications = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT a.*, s.title, s.amount, s.last_date
             FROM applications a
             JOIN scholarships s ON s.id = a.scholarship_id
             WHERE a.user_id = ?
             ORDER BY a.created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, applications: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/users/notifications
exports.getNotifications = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
            [req.user.id]
        );
        res.json({ success: true, notifications: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/users/notifications/:id/read
exports.markNotificationRead = async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
