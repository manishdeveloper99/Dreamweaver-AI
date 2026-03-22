// controllers/upload.js
const path = require('path');
const fs   = require('fs');
const db   = require('../../config/database');

// POST /api/upload/document
exports.uploadDocument = async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, message: 'No file uploaded.' });

        const { doc_type, application_id } = req.body;

        const [result] = await db.query(
            `INSERT INTO documents (user_id, application_id, doc_type, file_name, file_path, file_size, mime_type)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id,
                application_id || null,
                doc_type || 'other',
                req.file.originalname,
                req.file.filename,   // stored filename
                req.file.size,
                req.file.mimetype
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Document uploaded.',
            document: {
                id: result.insertId,
                file_name: req.file.originalname,
                file_path: `/uploads/${req.file.filename}`
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

// GET /api/upload/documents
exports.listDocuments = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, doc_type, file_name, file_path, file_size, mime_type, is_verified, uploaded_at FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC',
            [req.user.id]
        );
        res.json({ success: true, documents: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// DELETE /api/upload/documents/:id
exports.deleteDocument = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT file_path FROM documents WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        if (!rows.length)
            return res.status(404).json({ success: false, message: 'Document not found.' });

        // Delete physical file
        const filePath = path.join(__dirname, '../../storage/uploads', rows[0].file_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await db.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Document deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
