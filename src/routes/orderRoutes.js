const express = require("express");
const prisma = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Generate order number
const generateOrderNumber = () => {
  const now = new Date();
  const timestamp = now.getTime().toString().slice(-6);
  return `ORDR#${timestamp}`;
};

// Get all orders - ADMIN sees all, CASHIER sees only their own
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    const where = {};

    // Date filtering
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    // Role-based filtering: Cashiers only see their own orders
    if (req.user.role === "cashier") {
      where.createdBy = req.user.id;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        orderItems: {
          include: {
            menuItem: {
              select: { id: true, name: true, category: true },
            },
          },
        },
        cashier: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    const total = await prisma.order.count({ where });

    const formattedOrders = orders.map((order) => ({
      ...order,
      id: order.id.toString(),
      createdBy: order.createdBy.toString(),
      subtotal: parseFloat(order.subtotal),
      tax: parseFloat(order.tax),
      total: parseFloat(order.total),
      amountPaid: parseFloat(order.amountPaid),
      changeAmount: parseFloat(order.changeAmount),
      orderItems: order.orderItems.map((item) => ({
        ...item,
        id: item.id.toString(),
        orderId: item.orderId.toString(),
        menuItemId: item.menuItemId.toString(),
        menuItemPrice: parseFloat(item.menuItemPrice),
        lineTotal: parseFloat(item.lineTotal),
      })),
    }));

    res.json({
      orders: formattedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Get order by ID - ADMIN sees all, CASHIER sees only their own
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: BigInt(id) },
      include: {
        orderItems: {
          include: {
            menuItem: {
              select: { id: true, name: true, category: true },
            },
          },
        },
        cashier: {
          select: { id: true, username: true },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Cashiers can only see their own orders
    if (
      req.user.role === "cashier" &&
      order.createdBy.toString() !== req.user.id.toString()
    ) {
      return res.status(403).json({ error: "Access denied to this order" });
    }

    // Format response
    const formattedOrder = {
      ...order,
      id: order.id.toString(),
      createdBy: order.createdBy.toString(),
      subtotal: parseFloat(order.subtotal),
      tax: parseFloat(order.tax),
      total: parseFloat(order.total),
      amountPaid: parseFloat(order.amountPaid),
      changeAmount: parseFloat(order.changeAmount),
      orderItems: order.orderItems.map((item) => ({
        ...item,
        id: item.id.toString(),
        orderId: item.orderId.toString(),
        menuItemId: item.menuItemId.toString(),
        menuItemPrice: parseFloat(item.menuItemPrice),
        lineTotal: parseFloat(item.lineTotal),
      })),
    };

    res.json({ order: formattedOrder });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Create order
router.post("/", async (req, res) => {
  try {
    const { customerName, orderType, tableNumber, items, amountPaid } =
      req.body;

    if (!customerName || !orderType || !items || !amountPaid) {
      return res.status(400).json({
        error: "customerName, orderType, items, and amountPaid are required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ error: "Order must have at least one item" });
    }

    // Calculate order totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: BigInt(item.menuItemId) },
      });

      if (!menuItem || !menuItem.isAvailable) {
        return res.status(400).json({
          error: `Menu item ${item.menuItemId} not found or unavailable`,
        });
      }

      const lineTotal = parseFloat(menuItem.price) * item.quantity;
      subtotal += lineTotal;

      orderItems.push({
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        menuItemPrice: menuItem.price,
        quantity: item.quantity,
        lineTotal,
      });
    }

    const tax = subtotal * 0.05; // 5% tax (changed from 10%)
    const total = subtotal + tax;
    const changeAmount = Math.max(0, amountPaid - total);

    if (amountPaid < total) {
      return res.status(400).json({
        error: "Insufficient payment amount",
        required: total,
        provided: amountPaid,
      });
    }

    // Create order with items
    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerName,
        orderType,
        tableNumber: tableNumber || null,
        subtotal,
        tax,
        total,
        amountPaid,
        changeAmount,
        createdBy: req.user.id,
        orderItems: {
          create: orderItems,
        },
      },
      include: {
        orderItems: true,
        cashier: {
          select: { id: true, username: true },
        },
      },
    });

    // Format response
    const formattedOrder = {
      ...order,
      id: order.id.toString(),
      createdBy: order.createdBy.toString(),
      subtotal: parseFloat(order.subtotal),
      tax: parseFloat(order.tax),
      total: parseFloat(order.total),
      amountPaid: parseFloat(order.amountPaid),
      changeAmount: parseFloat(order.changeAmount),
      orderItems: order.orderItems.map((item) => ({
        ...item,
        id: item.id.toString(),
        orderId: item.orderId.toString(),
        menuItemId: item.menuItemId.toString(),
        menuItemPrice: parseFloat(item.menuItemPrice),
        lineTotal: parseFloat(item.lineTotal),
      })),
    };

    res.status(201).json({
      message: "Order created successfully",
      order: formattedOrder,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

module.exports = router;
