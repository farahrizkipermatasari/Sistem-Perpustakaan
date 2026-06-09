const express = require("express");
const mongoose = require("mongoose");

const app = express();
const PORT = 3001;

app.use(express.json());

const MONGO_URL =
  process.env.MONGO_URL ||
  "mongodb://book_user:book_password@book-db:27017/book_db?authSource=admin";


// Schema Book
const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    author: {
      type: String,
      required: true
    },
    isbn: {
      type: String,
      required: true,
      unique: true
    },
    stock: {
      type: Number,
      default: 1
    },
    category: {
      type: String,
      default: "Umum"
    }
  },
  {
    timestamps: true
  }
);

const Book = mongoose.model("Book", bookSchema);

// MongoDB Connection
async function connectWithRetry(retries = 20, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(MONGO_URL);
      console.log("Book Service berhasil terhubung ke MongoDB");
      return;
    } catch (error) {
      console.log(`Menunggu MongoDB siap... percobaan ${attempt}`);
      console.log(error.message);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Book Service gagal terhubung ke MongoDB");
}

// Seed Data Awal
async function seedBooks() {
  const total = await Book.countDocuments();

  if (total === 0) {
    await Book.create([
      {
        title: "Node.js Dasar",
        author: "Andi",
        isbn: "978001",
        stock: 10,
        category: "Programming"
      },
      {
        title: "MongoDB Praktis",
        author: "Budi",
        isbn: "978002",
        stock: 5,
        category: "Database"
      }
    ]);

    console.log("Data awal buku berhasil dibuat");
  }
}

// Health Check
app.get("/health", (req, res) => {
  res.json({
    service: "book-service",
    database: "mongodb",
    language: "Node.js",
    framework: "Express",
    status: "running"
  });
});

// GET All Books
app.get("/books", async (req, res) => {
  try {
    const books = await Book.find();

    res.json({
      service: "book-service",
      database: "mongodb",
      data: books
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil data buku",
      error: error.message
    });
  }
});

// GET Book By ID
app.get("/books/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({
        message: "Buku tidak ditemukan"
      });
    }

    res.json({
      service: "book-service",
      database: "mongodb",
      data: book
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil detail buku",
      error: error.message
    });
  }
});

// CREATE Book
app.post("/books", async (req, res) => {
  try {
    const { title, author, isbn, stock, category } = req.body;

    const book = await Book.create({
      title,
      author,
      isbn,
      stock,
      category
    });

    res.status(201).json({
      service: "book-service",
      message: "Buku berhasil ditambahkan",
      data: book
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal menambahkan buku",
      error: error.message
    });
  }
});

// UPDATE Book
app.put("/books/:id", async (req, res) => {
  try {
    const book = await Book.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!book) {
      return res.status(404).json({
        message: "Buku tidak ditemukan"
      });
    }

    res.json({
      service: "book-service",
      message: "Buku berhasil diperbarui",
      data: book
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal memperbarui buku",
      error: error.message
    });
  }
});

// UPDATE Stock Book
app.patch("/books/:id/stock", async (req, res) => {
  try {
    const {delta} = req.body;

    if (delta !== 1 && delta !== -1) {
      return res.status(400).json({
        message: "Delta harus bernilai 1 atau -1"
      });
    }
    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({
        message: "Buku tidak ditemukan"
      });
    }

    if (delta === -1 && book.stock <= 0) {
      return res.status(400).json({
        message: "Stok buku tidak cukup untuk dipinjam"
      });
    }

    book.stock += delta;
    
    await book.save();

    return res.json({
      service: "book-service",
      message: "Stok buku berhasil diperbarui",
      data: book
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal memperbarui stok buku",
      error: error.message
    });
  }
});

// DELETE Book
app.delete("/books/:id", async (req, res) => {
  try {
    const book = await Book.findByIdAndDelete(req.params.id);

    if (!book) {
      return res.status(404).json({
        message: "Buku tidak ditemukan"
      });
    }

    res.json({
      service: "book-service",
      message: "Buku berhasil dihapus"
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal menghapus buku",
      error: error.message
    });
  }
});

// Start Server
async function startServer() {
  await connectWithRetry();
  await seedBooks();

  app.listen(PORT, () => {
    console.log(`Book Service berjalan pada port ${PORT}`);
  });
}

startServer();