const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const listEndpoints = require("express-list-endpoints");
require("dotenv").config();

const app = express();

/* =======================
   Database
======================= */
const { connectDB } = require("./config/db"); // Updated import

/* =======================
   Routes
======================= */
const UserRoutes = require("./routes/Users.routes");
const CompanyRoutes = require("./routes/Company.route");
const IDManagementRoutes = require("./routes/IDManagment.routes");
/* =======================
   Middleware
======================= */
app.use(helmet());
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Global Request Logger
app.use((req, res, next) => {
  console.log(`\n🌐 [BACKEND REQ] ${new Date().toISOString()} | ${req.method} ${req.originalUrl}`);
  if (Object.keys(req.body).length > 0) {
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.password) sanitizedBody.password = "***HIDDEN***";
    if (sanitizedBody.Password) sanitizedBody.Password = "***HIDDEN***";
    console.log("   📦 Body:", sanitizedBody);
  }
  if (Object.keys(req.query).length > 0) console.log("   🔍 Query:", req.query);
  next();
});

/* =======================
   CORS Headers
======================= */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Enable CORS for all routes
app.use(
  cors({
    origin: "http://localhost:3000", // Your frontend URL
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
/* =======================
   Health Check
======================= */
app.get("/api", (req, res) => {
  res.send("You are connected to CourseNavigation server");
});

/* =======================
   API Routes
======================= */
app.use("/api/auth", UserRoutes);
app.use("/api/Company", CompanyRoutes);
app.use("/api/IDManage", IDManagementRoutes);
/* =======================
   🔥 Route Listing API (DEV ONLY)
======================= */
if (process.env.NODE_ENV !== "production") {
  app.get("/api/routes", (req, res) => {
    res.json(listEndpoints(app));
  });
}

/* =======================
   Database Connection & Server Start
======================= */
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Connect to database first
    console.log("🔄 Initializing database connection...");
    const pool = await connectDB();
    console.log("✅ Database connection established");

    // Start the server only after DB connection is successful
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Base URL: http://localhost:${PORT}`);

      /* =======================
         List All Routes (Console)
      ======================= */
      if (process.env.NODE_ENV !== "production") {
        console.log("\n📂 ========== AVAILABLE ROUTES ==========\n");

        const routes = listEndpoints(app);

        routes.forEach((route, index) => {
          console.log(
            `${index + 1}. ${route.methods.join(", ").padEnd(8)} ${route.path}`,
          );
        });

        console.log(`\n✅ Total Routes: ${routes.length}`);
        console.log("========================================\n");
      }
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    console.error("💡 Please check:");
    console.error("   1. SQL Server is running");
    console.error("   2. Database credentials are correct");
    console.error('   3. Database "LLD" exists');
    console.error('   4. User "node_user" has permissions');
    process.exit(1); // Exit if database connection fails
  }
}

// Start the server
startServer();

/* =======================
   Graceful Shutdown
======================= */
process.on("SIGINT", async () => {
  console.log("\n🔄 Shutting down gracefully...");
  try {
    const { sql } = require("./config/db");
    if (sql) {
      await sql.close();
      console.log("📴 Database connection closed");
    }
  } catch (err) {
    console.error("Error closing database connection:", err);
  }
  process.exit(0);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});
