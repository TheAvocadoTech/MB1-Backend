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
const rfidRoutes = require("./routes/rfid.routes");

/* =======================
   Middleware
======================= */
app.use(helmet());

/* =======================
   CORS — Allow frontend origins
======================= */
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:7000",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:7000",
      "http://192.168.20.10:3000",
      "http://192.168.20.10:3001",
      "http://192.168.20.10:7000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma", "X-Requested-With"],
  })
);

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
app.use("/api/rfid", rfidRoutes);
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
const PORT = process.env.PORT || 7000;

async function startServer() {
  try {
    // Connect to database first
    console.log("🔄 Initializing database connection...");
    const pool = await connectDB();
    console.log("✅ Database connection established");

    // Start the HTTP server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Base URL: http://192.168.20.10:${PORT}`);

      /* =======================
         Direct TCP Reader Socket Server (Port 9000)
      ======================= */
      const net = require("net");
      const { parseRRUHFR03Hex } = require("./utils/rfidHexParser");
      const rfidTrackerService = require("./services/rfidTracker.service");

      const tcpPort = process.env.RFID_TCP_PORT || 9000;
      const tcpServer = net.createServer((socket) => {
        console.log(`📡 [TCP RFID] Hardware reader connected from ${socket.remoteAddress}`);

        socket.on("data", (data) => {
          const rawHex = data.toString("hex").toUpperCase();
          console.log(`📥 [TCP RFID] Received payload: ${rawHex}`);
          try {
            const parsed = parseRRUHFR03Hex(rawHex);
            rfidTrackerService.updateScan({
              epc: parsed.epc,
              readerId: parsed.readerId,
              received_at: parsed.timestamp,
              rawHex: parsed.rawHex,
            });
          } catch (err) {
            console.error("❌ [TCP RFID] Packet Parse Error:", err.message);
          }
        });

        socket.on("error", (err) => {
          console.error("⚠️ [TCP RFID] Socket error:", err.message);
        });
      });

      tcpServer.listen(tcpPort, () => {
        console.log(`📡 [TCP RFID SERVER] Reader TCP Socket listening on port ${tcpPort}`);
      });

      /* =======================
         Live RFID External Data Stream Poller (http://16.170.141.146:5000/data)
      ======================= */
      const rfidPoller = require("./services/rfidPoller.service");
      rfidPoller.startPoller();

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
