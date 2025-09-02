const bcrypt = require("bcrypt");
const prisma = require("../config/database");

async function seed() {
  try {
    console.log("🌱 Seeding database...");

    // Create users with bcrypt (salt rounds 10)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash("admin123", saltRounds);

    const users = await prisma.user.createMany({
      data: [
        {
          username: "admin",
          email: "admin@padipos.com",
          password: hashedPassword,
          role: "admin",
        },
        {
          username: "cashier1",
          email: "cashier1@padipos.com",
          password: hashedPassword,
          role: "cashier",
        },
      ],
      skipDuplicates: true,
    });
    console.log(`✅ Created ${users.count} users`);

    // Create menu items
    const menuItems = await prisma.menuItem.createMany({
      data: [
        {
          name: "Nasi Goreng Spesial",
          category: "Food",
          price: 25000.0,
          description: "Nasi goreng dengan ayam, udang, dan telur",
        },
        {
          name: "Mie Ayam Bakso",
          category: "Food",
          price: 20000.0,
          description: "Mie ayam dengan bakso dan pangsit",
        },
        {
          name: "Es Teh Manis",
          category: "Beverages",
          price: 5000.0,
          description: "Teh manis dingin segar",
        },
        {
          name: "Es Campur",
          category: "Desserts",
          price: 15000.0,
          description: "Es campur dengan berbagai topping",
        },
      ],
      skipDuplicates: true,
    });
    console.log(`✅ Created ${menuItems.count} menu items`);

    console.log("✅ Database seeded successfully!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;
