const express = require("express");
const prisma = require("../config/database");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Daily sales summary - ADMIN ONLY
router.get("/daily-sales", requireRole(["admin"]), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Set date range
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else {
      // Default to last 7 days if no date range provided
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      dateFilter.createdAt = {
        gte: sevenDaysAgo,
      };
    }

    const orders = await prisma.order.findMany({
      where: dateFilter,
      select: {
        createdAt: true,
        total: true,
        orderType: true,
      },
    });

    // Group by date and calculate stats
    const dailyStats = {};

    orders.forEach((order) => {
      const dateKey = order.createdAt.toISOString().split("T")[0];

      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = {
          sale_date: dateKey,
          total_orders: 0,
          total_revenue: 0,
          dine_in_orders: 0,
          takeaway_orders: 0,
        };
      }

      dailyStats[dateKey].total_orders += 1;
      dailyStats[dateKey].total_revenue += parseFloat(order.total);

      if (order.orderType === "Dine_In") {
        dailyStats[dateKey].dine_in_orders += 1;
      } else if (order.orderType === "Take_Away") {
        dailyStats[dateKey].takeaway_orders += 1;
      }
    });

    const dailySales = Object.values(dailyStats).sort(
      (a, b) => new Date(b.sale_date) - new Date(a.sale_date),
    );

    res.json({ dailySales });
  } catch (error) {
    console.error("Daily sales report error:", error);
    res.status(500).json({ error: "Failed to generate daily sales report" });
  }
});

// Menu sales report - ADMIN ONLY
router.get("/menu-sales", requireRole(["admin"]), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Set date range
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.order = {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      };
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.order = {
        createdAt: {
          gte: thirtyDaysAgo,
        },
      };
    }

    const orderItems = await prisma.orderItem.findMany({
      where: dateFilter,
      include: {
        menuItem: {
          select: {
            name: true,
            category: true,
          },
        },
      },
    });

    // Group by menu item and calculate stats
    const menuStats = {};

    orderItems.forEach((item) => {
      const key = `${item.menuItem.name}-${item.menuItem.category}`;

      if (!menuStats[key]) {
        menuStats[key] = {
          name: item.menuItem.name,
          category: item.menuItem.category,
          total_sold: 0,
          total_sales: 0,
        };
      }

      menuStats[key].total_sold += item.quantity;
      menuStats[key].total_sales += parseFloat(item.lineTotal);
    });

    const menuSales = Object.values(menuStats).sort(
      (a, b) => b.total_sold - a.total_sold,
    );

    res.json({ menuSales });
  } catch (error) {
    console.error("Menu sales report error:", error);
    res.status(500).json({ error: "Failed to generate menu sales report" });
  }
});

// Cashier performance - ADMIN ONLY
router.get("/cashier-performance", requireRole(["admin"]), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Set date range
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.createdAt = {
        gte: thirtyDaysAgo,
      };
    }

    const orders = await prisma.order.findMany({
      where: {
        ...dateFilter,
        cashier: {
          role: "cashier",
        },
      },
      include: {
        cashier: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Group by cashier and calculate stats
    const cashierStats = {};

    orders.forEach((order) => {
      const cashierId = order.cashier.id.toString();

      if (!cashierStats[cashierId]) {
        cashierStats[cashierId] = {
          cashier_name: order.cashier.username,
          cashier_id: cashierId,
          total_orders: 0,
          total_sales: 0,
          order_values: [],
        };
      }

      cashierStats[cashierId].total_orders += 1;
      cashierStats[cashierId].total_sales += parseFloat(order.total);
      cashierStats[cashierId].order_values.push(parseFloat(order.total));
    });

    const cashierPerformance = Object.values(cashierStats)
      .map((cashier) => ({
        cashier_name: cashier.cashier_name,
        cashier_id: cashier.cashier_id,
        total_orders: cashier.total_orders,
        total_sales: cashier.total_sales,
        average_order_value:
          cashier.total_orders > 0
            ? cashier.total_sales / cashier.total_orders
            : 0,
      }))
      .sort((a, b) => b.total_sales - a.total_sales);

    res.json({ cashierPerformance });
  } catch (error) {
    console.error("Cashier performance report error:", error);
    res
      .status(500)
      .json({ error: "Failed to generate cashier performance report" });
  }
});

// My performance - CASHIER can see their own stats
router.get("/my-performance", requireRole(["cashier"]), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Set date range
    const dateFilter = {
      createdBy: req.user.id,
    };

    if (startDate && endDate) {
      dateFilter.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.createdAt = {
        gte: thirtyDaysAgo,
      };
    }

    const orders = await prisma.order.findMany({
      where: dateFilter,
      select: {
        total: true,
        orderType: true,
      },
    });

    // Calculate performance stats
    const performance = {
      total_orders: orders.length,
      total_sales: orders.reduce(
        (sum, order) => sum + parseFloat(order.total),
        0,
      ),
      average_order_value: 0,
      dine_in_orders: orders.filter((order) => order.orderType === "Dine_In")
        .length,
      takeaway_orders: orders.filter((order) => order.orderType === "Take_Away")
        .length,
    };

    if (performance.total_orders > 0) {
      performance.average_order_value =
        performance.total_sales / performance.total_orders;
    }

    res.json({ performance });
  } catch (error) {
    console.error("My performance report error:", error);
    res.status(500).json({ error: "Failed to generate performance report" });
  }
});

// Today's summary - BOTH ADMIN & CASHIER can access
router.get("/today-summary", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const whereClause = {
      createdAt: {
        gte: today,
        lt: tomorrow,
      },
    };

    // Cashiers only see their own stats
    if (req.user.role === "cashier") {
      whereClause.createdBy = req.user.id;
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      select: {
        total: true,
        orderType: true,
      },
    });

    const todaySummary = {
      total_orders: orders.length,
      total_revenue: orders.reduce(
        (sum, order) => sum + parseFloat(order.total),
        0,
      ),
      average_order_value: 0,
      dine_in_orders: orders.filter((order) => order.orderType === "Dine_In")
        .length,
      takeaway_orders: orders.filter((order) => order.orderType === "Take_Away")
        .length,
    };

    if (todaySummary.total_orders > 0) {
      todaySummary.average_order_value =
        todaySummary.total_revenue / todaySummary.total_orders;
    }

    res.json({ todaySummary });
  } catch (error) {
    console.error("Today summary report error:", error);
    res.status(500).json({ error: "Failed to generate today summary report" });
  }
});

// Top selling items - ADMIN ONLY
router.get("/top-selling", requireRole(["admin"]), async (req, res) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;

    // Set date range
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.order = {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      };
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.order = {
        createdAt: {
          gte: thirtyDaysAgo,
        },
      };
    }

    const orderItems = await prisma.orderItem.findMany({
      where: dateFilter,
      include: {
        menuItem: {
          select: {
            name: true,
            category: true,
            price: true,
          },
        },
      },
    });

    // Group by menu item and calculate stats
    const itemStats = {};

    orderItems.forEach((item) => {
      const key = item.menuItem.name;

      if (!itemStats[key]) {
        itemStats[key] = {
          name: item.menuItem.name,
          category: item.menuItem.category,
          price: parseFloat(item.menuItem.price),
          total_sold: 0,
          total_revenue: 0,
        };
      }

      itemStats[key].total_sold += item.quantity;
      itemStats[key].total_revenue += parseFloat(item.lineTotal);
    });

    const topSelling = Object.values(itemStats)
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, parseInt(limit));

    res.json({
      topSelling,
      period:
        startDate && endDate ? `${startDate} to ${endDate}` : "Last 30 days",
    });
  } catch (error) {
    console.error("Top selling report error:", error);
    res.status(500).json({ error: "Failed to generate top selling report" });
  }
});

// Revenue by order type - ADMIN ONLY
router.get("/revenue-by-type", requireRole(["admin"]), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Set date range
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.createdAt = {
        gte: thirtyDaysAgo,
      };
    }

    const orders = await prisma.order.findMany({
      where: dateFilter,
      select: {
        orderType: true,
        total: true,
      },
    });

    // Group by order type and calculate stats
    const typeStats = {};
    const totalOrders = orders.length;

    orders.forEach((order) => {
      const type = order.orderType;

      if (!typeStats[type]) {
        typeStats[type] = {
          order_type: type,
          total_orders: 0,
          total_revenue: 0,
          order_values: [],
        };
      }

      typeStats[type].total_orders += 1;
      typeStats[type].total_revenue += parseFloat(order.total);
      typeStats[type].order_values.push(parseFloat(order.total));
    });

    const revenueByType = Object.values(typeStats)
      .map((type) => ({
        order_type: type.order_type,
        total_orders: type.total_orders,
        total_revenue: type.total_revenue,
        average_order_value:
          type.total_orders > 0 ? type.total_revenue / type.total_orders : 0,
        percentage:
          totalOrders > 0
            ? Math.round((type.total_orders / totalOrders) * 100 * 100) / 100
            : 0,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue);

    res.json({ revenueByType });
  } catch (error) {
    console.error("Revenue by type report error:", error);
    res
      .status(500)
      .json({ error: "Failed to generate revenue by type report" });
  }
});

module.exports = router;
