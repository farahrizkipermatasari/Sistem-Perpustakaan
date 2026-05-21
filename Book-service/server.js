const express = require("express");
const mongoose = require("mongoose");

const app = express();
const PORT = 3001;

// Middleware untuk membaca JSON dari request body
app.use(express.json());

// ── Koneksi ke MongoDB ──────────────────────────────────────────
// MongoDB berjalan di container bernama "mongo-book" (dari docker-compose)
const MONGO_URL = process.env.MONGO_URL || "mongodb://mongo-book:27017/bookdb";

mongoose
  .connect(MONGO_URL)
  .then(() => console.log("Terhubung ke MongoDB"))
  .catch((err) => console.error("Gagal konek MongoDB:", err));

// ── Schema & Model ──────────────────────────────────────────────
// Mendefinisikan struktur data buku di MongoDB
const bookSchema = new mongoose.Schema({
  title:    { type: String, required: true },
  author:   { type: String, required: true },
  isbn:     { type: String, required: true, unique: true },
  stock:    { type: Number, default: 1 },
  category: { type: String, default: "Umum" },
});

const Book = mongoose.model("Book", bookSchema);

// ── Endpoint ────────────────────────────────────────────────────

// Health check — untuk memastikan service berjalan
app.get("/health", (req, res) => {
  res.json({
    service: "book-service",
    status: "running",
    database: "MongoDB",
    language: "Node.js",
  });
});

// GET semua buku
app.get("/books", async (req, res) => {
  try {
    const books = await Book.find();
    res.json({ service: "book-service", data: books });
  } catch (error) {
    res.status(500).json({ message: "Gagal mengambil data buku", error: error.message });
  }
});

// GET buku berdasarkan ID
app.get("/books/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Buku tidak ditemukan" });
    res.json({ service: "book-service", data: book });
  } catch (error) {
    res.status(500).json({ message: "Gagal mengambil buku", error: error.message });
  }
});

// POST tambah buku baru
app.post("/books", async (req, res) => {
  try {
    const book = new Book(req.body);
    await book.save();
    res.status(201).json({ service: "book-service", message: "Buku berhasil ditambahkan", data: book });
  } catch (error) {
    res.status(500).json({ message: "Gagal menambah buku", error: error.message });
  }
});

// PUT update buku
app.put("/books/:id", async (req, res) => {
  try {
    const book = await Book.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!book) return res.status(404).json({ message: "Buku tidak ditemukan" });
    res.json({ service: "book-service", message: "Buku berhasil diupdate", data: book });
  } catch (error) {
    res.status(500).json({ message: "Gagal update buku", error: error.message });
  }
});

// DELETE hapus buku
app.delete("/books/:id", async (req, res) => {
  try {
    const book = await Book.findByIdAndDelete(req.params.id);
    if (!book) return res.status(404).json({ message: "Buku tidak ditemukan" });
    res.json({ service: "book-service", message: "Buku berhasil dihapus" });
  } catch (error) {
    res.status(500).json({ message: "Gagal hapus buku", error: error.message });
  }
});

// ── Jalankan Server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Book Service berjalan pada port ${PORT}`);
});