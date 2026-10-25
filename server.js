require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, message: 'API and MySQL are connected' });
  } catch (e) {
    res.status(500).json({ ok: false, message: 'Database connection failed', detail: e.message });
  }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const [[books]] = await pool.query('SELECT COUNT(*) AS count, COALESCE(SUM(total_copies),0) AS copies FROM books');
    const [[members]] = await pool.query('SELECT COUNT(*) AS count FROM members');
    const [[active]] = await pool.query('SELECT COUNT(*) AS count FROM loans WHERE returned_on IS NULL');
    const [[overdue]] = await pool.query('SELECT COUNT(*) AS count FROM loans WHERE returned_on IS NULL AND due_on < CURRENT_DATE');
    res.json({ books: books.count, copies: books.copies, members: members.count, activeLoans: active.count, overdue: overdue.count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/books', async (req, res) => {
  try {
    const q = `%${String(req.query.q || '').trim()}%`;
    const [rows] = await pool.query(`
      SELECT b.book_id, b.isbn, b.title, b.publication_year, b.category,
             b.total_copies, b.available_copies, p.name AS publisher,
             COALESCE(GROUP_CONCAT(a.full_name ORDER BY a.full_name SEPARATOR ', '), '—') AS authors
      FROM books b
      LEFT JOIN publishers p ON p.publisher_id = b.publisher_id
      LEFT JOIN book_authors ba ON ba.book_id = b.book_id
      LEFT JOIN authors a ON a.author_id = ba.author_id
      WHERE b.title LIKE ? OR b.isbn LIKE ? OR b.category LIKE ? OR a.full_name LIKE ?
      GROUP BY b.book_id
      ORDER BY b.title`, [q, q, q, q]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/books', async (req, res) => {
  const { isbn, title, author, publisher, year, category, copies } = req.body;
  if (!isbn?.trim() || !title?.trim() || !author?.trim() || !category?.trim()) {
    return res.status(400).json({ error: 'ISBN, title, author and category are required.' });
  }
  const count = Number(copies);
  if (!Number.isInteger(count) || count < 1 || count > 10000) return res.status(400).json({ error: 'Copies must be a whole number from 1 to 10000.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let publisherId = null;
    if (publisher?.trim()) {
      const [p] = await conn.query('SELECT publisher_id FROM publishers WHERE name = ?', [publisher.trim()]);
      if (p.length) publisherId = p[0].publisher_id;
      else {
        const [result] = await conn.query('INSERT INTO publishers (name) VALUES (?)', [publisher.trim()]);
        publisherId = result.insertId;
      }
    }
    const [book] = await conn.query(
      'INSERT INTO books (isbn, title, publisher_id, publication_year, category, total_copies, available_copies) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [isbn.trim(), title.trim(), publisherId, year ? Number(year) : null, category.trim(), count, count]
    );
    let [a] = await conn.query('SELECT author_id FROM authors WHERE full_name = ?', [author.trim()]);
    let authorId;
    if (a.length) authorId = a[0].author_id;
    else {
      const [newAuthor] = await conn.query('INSERT INTO authors (full_name) VALUES (?)', [author.trim()]);
      authorId = newAuthor.insertId;
    }
    await conn.query('INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)', [book.insertId, authorId]);
    await conn.commit();
    res.status(201).json({ message: 'Book added successfully', book_id: book.insertId });
  } catch (e) {
    await conn.rollback();
    res.status(e.code === 'ER_DUP_ENTRY' ? 409 : 400).json({ error: e.code === 'ER_DUP_ENTRY' ? 'A book with this ISBN already exists.' : e.message });
  } finally { conn.release(); }
});

app.get('/api/members', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT member_id, full_name, email, phone, joined_on FROM members ORDER BY full_name');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members', async (req, res) => {
  const { full_name, email, phone } = req.body;
  if (!full_name?.trim() || !email?.trim()) return res.status(400).json({ error: 'Name and email are required.' });
  try {
    const [r] = await pool.query('INSERT INTO members (full_name, email, phone) VALUES (?, ?, ?)', [full_name.trim(), email.trim(), phone?.trim() || null]);
    res.status(201).json({ message: 'Member added successfully', member_id: r.insertId });
  } catch (e) { res.status(e.code === 'ER_DUP_ENTRY' ? 409 : 400).json({ error: e.code === 'ER_DUP_ENTRY' ? 'That email is already registered.' : e.message }); }
});

app.get('/api/loans', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT l.loan_id, b.title, m.full_name AS member, m.email, l.issued_on, l.due_on, l.returned_on,
             CASE WHEN l.returned_on IS NOT NULL THEN 'Returned'
                  WHEN l.due_on < CURRENT_DATE THEN 'Overdue' ELSE 'Issued' END AS status
      FROM loans l JOIN books b ON b.book_id=l.book_id JOIN members m ON m.member_id=l.member_id
      ORDER BY l.loan_id DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/loans', async (req, res) => {
  const bookId = Number(req.body.book_id), memberId = Number(req.body.member_id);
  const dueOn = req.body.due_on;
  if (!Number.isInteger(bookId) || !Number.isInteger(memberId) || !dueOn) return res.status(400).json({ error: 'Choose a book, a member and a due date.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [books] = await conn.query('SELECT available_copies FROM books WHERE book_id = ? FOR UPDATE', [bookId]);
    if (!books.length) throw Object.assign(new Error('Book not found.'), { status: 404 });
    if (books[0].available_copies < 1) throw Object.assign(new Error('No available copies of this book.'), { status: 400 });
    const [members] = await conn.query('SELECT member_id FROM members WHERE member_id = ?', [memberId]);
    if (!members.length) throw Object.assign(new Error('Member not found.'), { status: 404 });
    await conn.query('INSERT INTO loans (book_id, member_id, due_on) VALUES (?, ?, ?)', [bookId, memberId, dueOn]);
    await conn.query('UPDATE books SET available_copies = available_copies - 1 WHERE book_id = ?', [bookId]);
    await conn.commit();
    res.status(201).json({ message: 'Book issued successfully.' });
  } catch (e) {
    await conn.rollback();
    res.status(e.status || 400).json({ error: e.message });
  } finally { conn.release(); }
});

app.post('/api/loans/:id/return', async (req, res) => {
  const loanId = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT book_id, returned_on FROM loans WHERE loan_id = ? FOR UPDATE', [loanId]);
    if (!rows.length) throw Object.assign(new Error('Loan not found.'), { status: 404 });
    if (rows[0].returned_on) throw Object.assign(new Error('This book has already been returned.'), { status: 400 });
    await conn.query('UPDATE loans SET returned_on = CURRENT_DATE WHERE loan_id = ?', [loanId]);
    await conn.query('UPDATE books SET available_copies = available_copies + 1 WHERE book_id = ?', [rows[0].book_id]);
    await conn.commit();
    res.json({ message: 'Book returned successfully.' });
  } catch (e) {
    await conn.rollback();
    res.status(e.status || 400).json({ error: e.message });
  } finally { conn.release(); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Library system running at http://localhost:${PORT}`));
