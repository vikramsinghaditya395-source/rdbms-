CREATE DATABASE IF NOT EXISTS library_management
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE library_management;

-- Normalized schema: publishers, authors, books, book-author bridge,
-- members, loans. Many-to-many Books <-> Authors is resolved via book_authors.
CREATE TABLE IF NOT EXISTS publishers (
  publisher_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  email VARCHAR(150),
  phone VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS authors (
  author_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  UNIQUE KEY uq_author_name (full_name)
);

CREATE TABLE IF NOT EXISTS books (
  book_id INT AUTO_INCREMENT PRIMARY KEY,
  isbn VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  publisher_id INT NULL,
  publication_year SMALLINT NULL,
  category VARCHAR(80) NOT NULL,
  total_copies INT NOT NULL DEFAULT 1,
  available_copies INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_books_publisher FOREIGN KEY (publisher_id)
    REFERENCES publishers(publisher_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_total_copies CHECK (total_copies >= 0),
  CONSTRAINT chk_available_copies CHECK (available_copies >= 0 AND available_copies <= total_copies)
);

CREATE TABLE IF NOT EXISTS book_authors (
  book_id INT NOT NULL,
  author_id INT NOT NULL,
  PRIMARY KEY (book_id, author_id),
  CONSTRAINT fk_ba_book FOREIGN KEY (book_id)
    REFERENCES books(book_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_ba_author FOREIGN KEY (author_id)
    REFERENCES authors(author_id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS members (
  member_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(30),
  joined_on DATE NOT NULL DEFAULT (CURRENT_DATE)
);

CREATE TABLE IF NOT EXISTS loans (
  loan_id INT AUTO_INCREMENT PRIMARY KEY,
  book_id INT NOT NULL,
  member_id INT NOT NULL,
  issued_on DATE NOT NULL DEFAULT (CURRENT_DATE),
  due_on DATE NOT NULL,
  returned_on DATE NULL,
  CONSTRAINT fk_loans_book FOREIGN KEY (book_id)
    REFERENCES books(book_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loans_member FOREIGN KEY (member_id)
    REFERENCES members(member_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_loans_member (member_id),
  INDEX idx_loans_book_returned (book_id, returned_on)
);

-- Sample rows (safe to run more than once due to unique constraints).
INSERT IGNORE INTO publishers (name, email, phone) VALUES
('Penguin Random House', 'contact@penguinrandomhouse.com', '+1-212-782-9000'),
('HarperCollins', 'info@harpercollins.com', '+1-212-207-7000'),
('O''Reilly Media', 'info@oreilly.com', '+1-707-827-7000');

INSERT IGNORE INTO authors (full_name) VALUES
('George Orwell'), ('J. K. Rowling'), ('Robert C. Martin');

INSERT IGNORE INTO books (isbn, title, publisher_id, publication_year, category, total_copies, available_copies)
SELECT '9780451524935', '1984', publisher_id, 1949, 'Fiction', 5, 5
FROM publishers WHERE name = 'Penguin Random House';
INSERT IGNORE INTO books (isbn, title, publisher_id, publication_year, category, total_copies, available_copies)
SELECT '9780439064873', 'Harry Potter and the Chamber of Secrets', publisher_id, 1998, 'Fantasy', 4, 4
FROM publishers WHERE name = 'HarperCollins';
INSERT IGNORE INTO books (isbn, title, publisher_id, publication_year, category, total_copies, available_copies)
SELECT '9780132350884', 'Clean Code', publisher_id, 2008, 'Technology', 3, 3
FROM publishers WHERE name = 'O''Reilly Media';

INSERT IGNORE INTO book_authors (book_id, author_id)
SELECT b.book_id, a.author_id FROM books b JOIN authors a ON a.full_name = 'George Orwell' WHERE b.isbn = '9780451524935';
INSERT IGNORE INTO book_authors (book_id, author_id)
SELECT b.book_id, a.author_id FROM books b JOIN authors a ON a.full_name = 'J. K. Rowling' WHERE b.isbn = '9780439064873';
INSERT IGNORE INTO book_authors (book_id, author_id)
SELECT b.book_id, a.author_id FROM books b JOIN authors a ON a.full_name = 'Robert C. Martin' WHERE b.isbn = '9780132350884';

INSERT IGNORE INTO members (full_name, email, phone) VALUES
('Aarav Sharma', 'aarav@example.com', '9876543210'),
('Ananya Verma', 'ananya@example.com', '9876501234');
