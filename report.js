// controllers/report.js
const db = require('../../config/database');

// GET /api/reports
exports.listScholarships = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM scholarships WHERE status = 'active' ORDER BY last_date ASC`
        );
        res.json({ success: true, scholarships: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/reports/:id
exports.getScholarship = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM scholarships WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Scholarship not found.' });
        res.json({ success: true, scholarship: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/reports/:id/apply
exports.applyScholarship = async (req, res) => {
    try {
        const scholarshipId = req.params.id;
        const userId = req.user.id;

        // Check already applied
        const [existing] = await db.query(
            'SELECT id FROM applications WHERE user_id = ? AND scholarship_id = ?',
            [userId, scholarshipId]
        );
        if (existing.length > 0)
            return res.status(409).json({ success: false, message: 'Already applied for this scholarship.' });

        const formData = req.body.formData || {};

        const [result] = await db.query(
            `INSERT INTO applications (user_id, scholarship_id, status, applied_at, form_data)
             VALUES (?, ?, 'submitted', NOW(), ?)`,
            [userId, scholarshipId, JSON.stringify(formData)]
        );

        // Add notification
        await db.query(
            `INSERT INTO notifications (user_id, title, message, type)
             VALUES (?, 'Application Submitted', 'Your scholarship application has been submitted successfully.', 'success')`,
            [userId]
        );

        res.status(201).json({ success: true, message: 'Application submitted!', applicationId: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/reports/application/:appId
exports.getApplication = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT a.*, s.title, s.description, s.amount, s.last_date, s.documents
             FROM applications a
             JOIN scholarships s ON s.id = a.scholarship_id
             WHERE a.id = ? AND a.user_id = ?`,
            [req.params.appId, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Application not found.' });
        res.json({ success: true, application: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/reports/application/:appId
exports.updateApplication = async (req, res) => {
    try {
        const { formData, status } = req.body;
        const allowedStatus = ['draft', 'submitted'];
        const newStatus = allowedStatus.includes(status) ? status : 'draft';

        await db.query(
            `UPDATE applications SET form_data = ?, status = ? WHERE id = ? AND user_id = ?`,
            [JSON.stringify(formData), newStatus, req.params.appId, req.user.id]
        );
        res.json({ success: true, message: 'Application updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// DELETE /api/reports/application/:appId
exports.withdrawApplication = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT status FROM applications WHERE id = ? AND user_id = ?`,
            [req.params.appId, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Application not found.' });
        if (['approved', 'rejected'].includes(rows[0].status))
            return res.status(400).json({ success: false, message: 'Cannot withdraw a reviewed application.' });

        await db.query('DELETE FROM applications WHERE id = ? AND user_id = ?', [req.params.appId, req.user.id]);
        res.json({ success: true, message: 'Application withdrawn.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
