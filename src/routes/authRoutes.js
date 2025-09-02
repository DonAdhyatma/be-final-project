const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const prisma = require("../config/database");

const router = express.Router();

// Validation helper menggunakan validator library yang sudah ada
const validateInput = (req, res, next) => {
  const errors = [];

  // Email validation
  if (req.body.email && !validator.isEmail(req.body.email)) {
    errors.push({ field: "email", message: "Please provide valid email" });
  }

  // Username validation
  if (req.body.username && !validator.isLength(req.body.username, { min: 3 })) {
    errors.push({
      field: "username",
      message: "Username must be at least 3 characters",
    });
  }

  // Password validation
  if (req.body.password && !validator.isLength(req.body.password, { min: 6 })) {
    errors.push({
      field: "password",
      message: "Password must be at least 6 characters",
    });
  }

  // Role validation
  if (req.body.role && !validator.isIn(req.body.role, ["admin", "cashier"])) {
    errors.push({ field: "role", message: "Invalid role" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

// Register
router.post("/register", validateInput, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({
        error: "All fields are required",
        required: ["username", "email", "password", "role"],
      });
    }

    // Hash password with bcrypt (not bcryptjs)
    const saltRounds = 10; // Reduce from 12 to 10 for better performance
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      message: "User created successfully",
      user,
    });
  } catch (error) {
    console.error("Register error:", error);

    if (error.code === "P2002") {
      const field = error.meta?.target?.[0] || "field";
      return res.status(400).json({
        error: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
      });
    }

    res.status(500).json({ error: "Failed to create user" });
  }
});

// Login
router.post("/login", validateInput, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.status !== "active") {
      return res
        .status(401)
        .json({ error: "Invalid credentials or account inactive" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Get current user
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: BigInt(decoded.userId) },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        ...user,
        id: user.id.toString(),
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(403).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;
