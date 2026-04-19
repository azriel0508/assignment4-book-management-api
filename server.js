const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// This lets Express read JSON from request bodies (like when we POST or PUT)
app.use(express.json());

// Connect to (or create) the SQLite database file in the same folder
const db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
  if (err) {
    console.error('Could not connect to the database:', err.message);
  } else {
    console.log('Connected to database.db successfully.');
  }
});

// These are the only statuses a book is allowed to have
const VALID_STATUSES = ['to-read', 'reading', 'completed'];

// Set up the books table when the server starts — won't overwrite if it already exists
db.run(`
  CREATE TABLE IF NOT EXISTS books (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    title  TEXT NOT NULL,
    author TEXT NOT NULL,
    year   INTEGER,
    status TEXT NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Failed to create books table:', err.message);
  } else {
    console.log('Books table is ready.');
  }
});


// ─── GET /books ───────────────────────────────────────────────────────────────
// Returns all books. If ?status=reading (or any valid status) is passed,
// it filters the results down to just that status.
app.get('/books', (req, res) => {
  const { status } = req.query;

  // If a status filter was provided, make sure it's a valid one before querying
  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status filter. Allowed values: ${VALID_STATUSES.join(', ')}`
      });
    }
    db.all('SELECT * FROM books WHERE status = ?', [status], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
      res.json(rows);
    });
  } else {
    // No filter — just grab everything
    db.all('SELECT * FROM books', [], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
      res.json(rows);
    });
  }
});


// ─── GET /books/:id ───────────────────────────────────────────────────────────
// Fetch a single book by its ID. Returns 404 if nothing is found.
app.get('/books/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM books WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
    if (!row) return res.status(404).json({ error: `No book found with ID ${id}` });
    res.json(row);
  });
});


// ─── POST /books ──────────────────────────────────────────────────────────────
// Add a new book. Title, author, and status are required; year is optional.
app.post('/books', (req, res) => {
  const { title, author, year, status } = req.body;

  // Make sure the required fields are actually there
  if (!title || !author || !status) {
    return res.status(400).json({ error: 'title, author, and status are required fields.' });
  }

  // Double-check the status value is one we accept
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Allowed values: ${VALID_STATUSES.join(', ')}`
    });
  }

  // Using a parameterised query here to keep things safe from SQL injection
  db.run(
    'INSERT INTO books (title, author, year, status) VALUES (?, ?, ?, ?)',
    [title, author, year || null, status],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
      // `this.lastID` gives us the ID that was just auto-assigned to the new row
      res.status(201).json({ message: 'Book added successfully.', id: this.lastID });
    }
  );
});


// ─── PUT /books/:id ───────────────────────────────────────────────────────────
// Update an existing book's title, year, and/or status.
// Author cannot be changed — that's by design per the spec.
app.put('/books/:id', (req, res) => {
  const { id } = req.params;
  const { title, year, status } = req.body;

  // Validate status if it was included in the request
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Allowed values: ${VALID_STATUSES.join(', ')}`
    });
  }

  // First check the book actually exists before trying to update it
  db.get('SELECT * FROM books WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
    if (!row) return res.status(404).json({ error: `No book found with ID ${id}` });

    // Use whatever was sent in the request, otherwise fall back to what's already saved
    const updatedTitle  = title  !== undefined ? title  : row.title;
    const updatedYear   = year   !== undefined ? year   : row.year;
    const updatedStatus = status !== undefined ? status : row.status;

    db.run(
      'UPDATE books SET title = ?, year = ?, status = ? WHERE id = ?',
      [updatedTitle, updatedYear, updatedStatus, id],
      function (err) {
        if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
        res.json({ message: `Book ${id} updated successfully.` });
      }
    );
  });
});


// ─── DELETE /books/:id ────────────────────────────────────────────────────────
// Remove a book permanently. Returns 404 if the ID doesn't exist.
app.delete('/books/:id', (req, res) => {
  const { id } = req.params;

  // Check it exists first so we can give a helpful 404 instead of a silent no-op
  db.get('SELECT * FROM books WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
    if (!row) return res.status(404).json({ error: `No book found with ID ${id}` });

    db.run('DELETE FROM books WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
      res.json({ message: `Book "${row.title}" (ID ${id}) was deleted successfully.` });
    });
  });
});


// Start the server — everything is ready to go
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
