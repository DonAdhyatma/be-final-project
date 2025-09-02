const express = require("express");
const validator = require("validator");
const prisma = require("../config/database");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation helper
const validateMenuItem = (req, res, next) => {
  const errors = [];

  if (req.body.name && req.body.name.trim().length === 0) {
    errors.push({ field: "name", message: "Name is required" });
  }

  if (
    req.body.category &&
    !["Food", "Beverages", "Desserts"].includes(req.body.category)
  ) {
    errors.push({ field: "category", message: "Invalid category" });
  }

  if (
    req.body.price &&
    (isNaN(req.body.price) || parseFloat(req.body.price) <= 0)
  ) {
    errors.push({ field: "price", message: "Price must be greater than 0" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

// Get all menu items - CASHIER & ADMIN can access
router.get("/", async (req, res) => {
  try {
    const { category, available, search } = req.query;

    const where = {};
    if (category) where.category = category;
    if (available !== undefined) where.isAvailable = available === "true";
    if (search) {
      where.name = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Cashiers can only see available items by default
    if (req.user.role === "cashier" && available === undefined) {
      where.isAvailable = true;
    }

    const menuItems = await prisma.menuItem.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    // Convert BigInt to string for JSON
    const formattedItems = menuItems.map((item) => ({
      ...item,
      id: item.id.toString(),
      price: parseFloat(item.price),
    }));

    res.json({
      menuItems: formattedItems,
      total: formattedItems.length,
    });
  } catch (error) {
    console.error("Get menu items error:", error);
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
});

// Get menu item by ID - CASHIER & ADMIN can access
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const menuItem = await prisma.menuItem.findUnique({
      where: { id: BigInt(id) },
    });

    if (!menuItem) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    // Cashiers can only see available items
    if (req.user.role === "cashier" && !menuItem.isAvailable) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    res.json({
      menuItem: {
        ...menuItem,
        id: menuItem.id.toString(),
        price: parseFloat(menuItem.price),
      },
    });
  } catch (error) {
    console.error("Get menu item error:", error);
    res.status(500).json({ error: "Failed to fetch menu item" });
  }
});

// Create menu item - ADMIN ONLY
router.post("/", requireRole(["admin"]), validateMenuItem, async (req, res) => {
  try {
    const { name, category, price, description, image } = req.body;

    if (!name || !category || !price) {
      return res.status(400).json({
        error: "Name, category, and price are required",
      });
    }

    const menuItem = await prisma.menuItem.create({
      data: {
        name: name.trim(),
        category,
        price: parseFloat(price),
        description: description?.trim() || null,
        image: image?.trim() || null,
      },
    });

    res.status(201).json({
      message: "Menu item created successfully",
      menuItem: {
        ...menuItem,
        id: menuItem.id.toString(),
        price: parseFloat(menuItem.price),
      },
    });
  } catch (error) {
    console.error("Create menu item error:", error);
    res.status(500).json({ error: "Failed to create menu item" });
  }
});

// Update menu item - ADMIN ONLY
router.put(
  "/:id",
  requireRole(["admin"]),
  validateMenuItem,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };

      // Convert price to float if provided
      if (updateData.price) {
        updateData.price = parseFloat(updateData.price);
      }

      const menuItem = await prisma.menuItem.update({
        where: { id: BigInt(id) },
        data: updateData,
      });

      res.json({
        message: "Menu item updated successfully",
        menuItem: {
          ...menuItem,
          id: menuItem.id.toString(),
          price: parseFloat(menuItem.price),
        },
      });
    } catch (error) {
      console.error("Update menu item error:", error);

      if (error.code === "P2025") {
        return res.status(404).json({ error: "Menu item not found" });
      }

      res.status(500).json({ error: "Failed to update menu item" });
    }
  },
);

// Delete menu item - ADMIN ONLY
router.delete("/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.menuItem.delete({
      where: { id: BigInt(id) },
    });

    res.json({ message: "Menu item deleted successfully" });
  } catch (error) {
    console.error("Delete menu item error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({ error: "Menu item not found" });
    }

    res.status(500).json({ error: "Failed to delete menu item" });
  }
});

module.exports = router;
