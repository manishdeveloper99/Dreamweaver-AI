// controllers/admin.js
const db = require('../../config/database');

// ── USERS ─────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, name, email, role, phone, state, class, category, is_verified, is_active, created_at
             FROM users ORDER BY created_at DESC`
        );
        res.json({ success: true, users: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, name, email, role, phone, state, city, class, category, income, profile_pic, is_verified, is_active, created_at
             FROM users WHERE id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const { is_active } = req.body;
        await db.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active, req.params.id]);
        res.json({ success: true, message: `User ${is_active ? 'activated' : 'deactivated'}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (req.params.id == req.user.id)
            return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
        await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'User deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── SCHOLARSHIPS ──────────────────────────────────────────────
exports.getAllScholarships = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM scholarships ORDER BY created_at DESC');
        res.json({ success: true, scholarships: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.createScholarship = async (req, res) => {
    try {
        const { title, description, eligibility, amount, last_date, state, category, class_level, documents, apply_url, status } = req.body;
        const [result] = await db.query(
            `INSERT INTO scholarships (title, description, eligibility, amount, last_date, state, category, class_level, documents, apply_url, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, description, eligibility, amount, last_date, state || null, category || 'All', class_level, JSON.stringify(documents || []), apply_url || null, status || 'active', req.user.id]
        );
        res.status(201).json({ success: true, message: 'Scholarship created.', id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateScholarship = async (req, res) => {
    try {
        const { title, description, eligibility, amount, last_date, state, category, class_level, documents, apply_url, status } = req.body;
        await db.query(
            `UPDATE scholarships SET title=?, description=?, eligibility=?, amount=?, last_date=?, state=?, category=?, class_level=?, documents=?, apply_url=?, status=? WHERE id=?`,
            [title, description, eligibility, amount, last_date, state, category, class_level, JSON.stringify(documents || []), apply_url, status, req.params.id]
        );
        res.json({ success: true, message: 'Scholarship updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteScholarship = async (req, res) => {
    try {
        await db.query('DELETE FROM scholarships WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Scholarship deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── APPLICATIONS ──────────────────────────────────────────────
exports.getAllApplications = async (req, res) => {
    try {
        const { status } = req.query;
        let query = `SELECT a.*, u.name AS student_name, u.email AS student_email, s.title AS scholarship_title
                     FROM applications a
                     JOIN users u ON u.id = a.user_id
                     JOIN scholarships s ON s.id = a.scholarship_id`;
        const params = [];
        if (status) { query += ' WHERE a.status = ?'; params.push(status); }
        query += ' ORDER BY a.created_at DESC';
        const [rows] = await db.query(query, params);
        res.json({ success: true, applications: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.reviewApplication = async (req, res) => {
    try {
        const { status, remarks } = req.body;
        const allowed = ['approved', 'rejected', 'under_review'];
        if (!allowed.includes(status))
            return res.status(400).json({ success: false, message: 'Invalid status.' });

        await db.query(
            `UPDATE applications SET status = ?, remarks = ?, reviewer_id = ?, reviewed_at = NOW() WHERE id = ?`,
            [status, remarks || null, req.user.id, req.params.id]
        );

        // Notify the student
        const [rows] = await db.query('SELECT user_id FROM applications WHERE id = ?', [req.params.id]);
        if (rows.length) {
            const msg = status === 'approved' ? 'Congratulations! Your application has been approved.' : `Your application status: ${status}.`;
            await db.query(
                `INSERT INTO notifications (user_id, title, message, type) VALUES (?, 'Application Update', ?, ?)`,
                [rows[0].user_id, msg, status === 'approved' ? 'success' : 'info']
            );
        }

        res.json({ success: true, message: 'Application reviewed.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── DASHBOARD STATS ───────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
    try {
        const [[users]]          = await db.query('SELECT COUNT(*) AS total FROM users WHERE role = "student"');
        const [[scholarships]]   = await db.query('SELECT COUNT(*) AS total FROM scholarships WHERE status = "active"');
        const [[applications]]   = await db.query('SELECT COUNT(*) AS total FROM applications');
        const [[approved]]       = await db.query('SELECT COUNT(*) AS total FROM applications WHERE status = "approved"');
        const [[pending]]        = await db.query('SELECT COUNT(*) AS total FROM applications WHERE status IN ("submitted","under_review")');

        res.json({
            success: true,
            stats: {
                totalStudents:      users.total,
                activeScholarships: scholarships.total,
                totalApplications:  applications.total,
                approvedApplications: approved.total,
                pendingApplications:  pending.total
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
