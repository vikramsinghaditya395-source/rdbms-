# Libra — Library Book Management System (RDBMS Project)

A working student project using **HTML, CSS, JavaScript, Node.js/Express and MySQL**. The frontend talks to the Express REST API; the API reads and writes the MySQL database. You do not need to run SQL INSERT statements to demonstrate the project.

## Requirements
- Node.js 18+ (20 LTS recommended)
- MySQL Server 8.0+ and MySQL Workbench
- VS Code (recommended)

## 1. Create the database
1. Start your local MySQL server.
2. Open MySQL Workbench and connect to your local instance.
3. Open `database/schema.sql` from this project.
4. Click the lightning-bolt **Execute** button to run the whole script.
5. Refresh the Schemas panel. You should see `library_management` with six tables: `publishers`, `authors`, `books`, `book_authors`, `members`, `loans`.
6. Optional ER diagram: in Workbench choose **Database → Reverse Engineer**, select your local connection, choose `library_management`, then finish the wizard. Workbench will generate an EER diagram from the foreign keys. Save it as a model or export it as an image/PDF for your submission.

The script creates sample books, authors, publishers and members so the dashboard is not empty. It uses `INSERT IGNORE` for seed rows so rerunning the script will not duplicate those sample records.

## 2. Configure the backend
1. Open this folder in VS Code.
2. Copy `.env.example` and name the copy `.env` (exactly `.env`, not `.env.txt`).
3. Open `.env` and set `DB_USER` and `DB_PASSWORD` to your MySQL credentials. For a default local MySQL setup, the user is often `root`; use the password you configured during installation.
4. Open the VS Code terminal in this project folder and run:

   ```bash
   npm install
   ```
5. Start the app:

   ```bash
   npm start
   ```
6. Open **http://localhost:3000** in your browser. The frontend and backend are served from the same server. Keep the terminal running while you use the app.

## 3. Test the connection
Open `http://localhost:3000/api/health`. If connected, you should see:

```json
{"ok":true,"message":"API and MySQL are connected"}
```

If it reports a database connection error:
- Confirm the MySQL service is running.
- Check the password and username in `.env`.
- Confirm the schema script completed and `library_management` exists.
- If your MySQL server uses another port, update `DB_PORT`.

## 4. Features to demonstrate
- Dashboard with total titles, physical copies, registered members, active loans and overdue loans.
- Search catalogue by title, author, ISBN or category.
- Add books using the frontend. New publisher/author records are created automatically as needed.
- Register a member from the frontend.
- Issue a book to a member. The backend validates available stock, inserts a loan and decreases `available_copies` inside a transaction.
- Return a book. The backend marks the loan returned and increases available copies inside a transaction.
- Loan status is calculated as Issued, Overdue or Returned.

## 5. Database design / normalization viva notes
This schema has six tables (more than the required 5–6).

- **publishers**: one row per publisher. Publisher contact information is stored once instead of repeated on every book.
- **authors**: one row per author.
- **books**: each book edition/catalogue item has one unique ISBN and references its publisher through `publisher_id`.
- **book_authors**: junction table resolves the many-to-many relationship between books and authors. Its composite primary key `(book_id, author_id)` prevents duplicate links.
- **members**: one row per registered library member; email is unique.
- **loans**: one row per issue event, linking a member and a book with foreign keys. A book can have many loan events over time.

**Relationships**
- Publisher 1 → many Books.
- Books many ↔ many Authors through Book_Authors.
- Members 1 → many Loans.
- Books 1 → many Loans.

**Why it is normalized:** Each table stores facts about one main entity. Publisher and author details are not duplicated across book rows. The book-author many-to-many relationship is separated into its own relation. Non-key columns depend on the key for that table, helping meet 3NF in this design.

**Important design choice:** `available_copies` is maintained when a book is issued/returned. The API uses a transaction and locks the book row while issuing to avoid two simultaneous requests borrowing the last copy. For a more advanced design, availability can instead be derived from total copies minus active loans, avoiding duplicated state.

## 6. API routes
- `GET /api/health` — verify database connection
- `GET /api/dashboard` — dashboard totals
- `GET /api/books?q=clean` — search books
- `POST /api/books` — add a book
- `GET /api/members` / `POST /api/members` — list/register members
- `GET /api/loans` — list loan history
- `POST /api/loans` — issue a book
- `POST /api/loans/:id/return` — return a book

## Common problems
- **`npm is not recognized`**: install Node.js LTS from https://nodejs.org, close all VS Code windows, reopen VS Code and run `node -v` and `npm -v`.
- **`Access denied for user`**: update `DB_USER` and `DB_PASSWORD` in `.env`.
- **`ECONNREFUSED 127.0.0.1:3306`**: start MySQL Server or correct `DB_PORT`.
- **`Unknown database library_management`**: execute `database/schema.sql` in Workbench.
- **Port 3000 in use**: set `PORT=3001` in `.env`, then open `http://localhost:3001`.

## Notes
This is a local demo app, not a production-secured service. It has no authentication, role permissions, backups or deployment configuration. Do not expose it publicly with real member data without adding security and production database hosting.
