// controllers/auth.js
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../../config/database');
const { generateTokens, generateOTP } = require('../../security/jwtAuth');

// ── REGISTER ──────────────────────────────────────────────────
exports.register = async (req, res) => {
    try {
        const { name, email, password, phone, state, class: cls, category } = req.body;

        // Check if email exists
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0)
            return res.status(409).json({ success: false, message: 'Email already registered.' });

        const hash = await bcrypt.hash(password, 12);

        const [result] = await db.query(
            `INSERT INTO users (name, email, password_hash, phone, state, class, category)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, email, hash, phone || null, state || null, cls || null, category || null]
        );

        // TODO: Send verification email via services/email.js

        res.status(201).json({
            success: true,
            message: 'Registration successful! Please verify your email.',
            userId: result.insertId
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

// ── LOGIN ─────────────────────────────────────────────────────
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const [rows] = await db.query(
            'SELECT * FROM users WHERE email = ? AND is_active = 1',
            [email]
        );
        if (rows.length === 0)
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match)
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        const { accessToken, refreshToken } = generateTokens(user);

        // Save refresh token to DB
        await db.query(
            `INSERT INTO sessions (user_id, refresh_token, ip_address, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
            [user.id, refreshToken, req.ip]
        );

        res.json({
            success: true,
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                profile_pic: user.profile_pic
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

// ── LOGOUT ────────────────────────────────────────────────────
exports.logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken)
            await db.query('DELETE FROM sessions WHERE refresh_token = ?', [refreshToken]);
        res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── REFRESH TOKEN ─────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken)
            return res.status(400).json({ success: false, message: 'Refresh token required.' });

        const [rows] = await db.query(
            `SELECT s.*, u.* FROM sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.refresh_token = ? AND s.expires_at > NOW()`,
            [refreshToken]
        );
        if (rows.length === 0)
            return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });

        const { accessToken, refreshToken: newRefresh } = generateTokens(rows[0]);

        // Rotate refresh token
        await db.query(
            `UPDATE sessions SET refresh_token = ?, expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY)
             WHERE refresh_token = ?`,
            [newRefresh, refreshToken]
        );

        res.json({ success: true, accessToken, refreshToken: newRefresh });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── FORGOT PASSWORD ───────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (rows.length === 0)
            return res.status(404).json({ success: false, message: 'Email not found.' });

        const otp = generateOTP();
        await db.query(
            `INSERT INTO otp_tokens (user_id, token, purpose, expires_at)
             VALUES (?, ?, 'reset_password', DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
            [rows[0].id, otp]
        );

        // TODO: Send OTP via services/email.js

        res.json({ success: true, message: 'OTP sent to your email.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── RESET PASSWORD ────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const [rows] = await db.query(
            `SELECT ot.id FROM otp_tokens ot
             JOIN users u ON u.id = ot.user_id
             WHERE u.email = ? AND ot.token = ? AND ot.purpose = 'reset_password'
               AND ot.expires_at > NOW() AND ot.used = 0`,
            [email, otp]
        );
        if (rows.length === 0)
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });

        const hash = await bcrypt.hash(newPassword, 12);
        await db.query('UPDATE users u JOIN otp_tokens ot ON ot.user_id = u.id SET u.password_hash = ? WHERE u.email = ?', [hash, email]);
        await db.query('UPDATE otp_tokens SET used = 1 WHERE id = ?', [rows[0].id]);

        res.json({ success: true, message: 'Password reset successful.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── VERIFY EMAIL ──────────────────────────────────────────────
exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;
        const [rows] = await db.query(
            `SELECT user_id FROM otp_tokens
             WHERE token = ? AND purpose = 'verify_email' AND expires_at > NOW() AND used = 0`,
            [token]
        );
        if (rows.length === 0)
            return res.status(400).json({ success: false, message: 'Invalid or expired link.' });

        await db.query('UPDATE users SET is_verified = 1 WHERE id = ?', [rows[0].user_id]);
        await db.query('UPDATE otp_tokens SET used = 1 WHERE token = ?', [token]);

        res.json({ success: true, message: 'Email verified successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
