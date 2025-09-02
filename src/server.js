require("dotenv").config();
const express = require("express");
const cors = require("cors");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 4035;

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic routes
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to PADIPOS API v1.0",
    version: "1.0.0",
    status: "running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "PADIPOS Backend is running!",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
  });
});

// Test database connection
app.get("/api/test-db", async (req, res) => {
  try {
    const { PrismaClient } = require("./generated/prisma");
    const prisma = new PrismaClient();

    await prisma.$connect();
    res.json({
      status: "OK",
      message: "Database connection successful!",
      database: "PostgreSQL",
    });

    await prisma.$disconnect();
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Import and use routes (when ready)
try {
  const authRoutes = require("./routes/authRoutes");
  const userRoutes = require("./routes/userRoutes");
  const menuRoutes = require("./routes/menuRoutes");
  const orderRoutes = require("./routes/orderRoutes");
  const reportRoutes = require("./routes/reportRoutes");

  // Mount routes
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/menu", menuRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/reports", reportRoutes);

  console.log("✅ All routes loaded successfully");
} catch (error) {
  console.log("⚠️  Some routes not loaded yet:", error.message);
}

// Error handling middleware (Express v5 compatible)
app.use((err, req, res, next) => {
  console.error("Error:", err);

  // Handle async errors in Express v5
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation failed",
      details: err.errors,
    });
  }

  res.status(err.status || 500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 PADIPOS Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🗃️  Database test: http://localhost:${PORT}/api/test-db`);
});
