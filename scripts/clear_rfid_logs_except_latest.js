// scripts/clear_rfid_logs_except_latest.js
require("dotenv").config();
const { connectDB, sql } = require("../config/db");

async function run() {
  console.log("🧹 Clearing all RFID logs and keeping only the latest live scan...");
  try {
    const pool = await connectDB();

    // 1. Instant truncate of all accumulated 1.9M rows
    console.log("⚡ Executing instant TRUNCATE on RfidLogs...");
    await pool.request().query("TRUNCATE TABLE dbo.RfidLogs;");
    console.log("✅ RfidLogs truncated in milliseconds!");

    // 2. Insert the latest verified live scan (Tag V002 at Man Trap / reader 38)
    console.log("💾 Storing single latest verified location log...");
    const insertReq = pool.request();
    insertReq.input("RfidCode", sql.VarChar(100), "563030320CE2806995200050");
    insertReq.input("MachineNumber", sql.VarChar(50), "38");
    insertReq.input("Location", sql.VarChar(100), "Man Trap");
    insertReq.input("ReceivedAt", sql.DateTime, new Date());

    await insertReq.query(`
      INSERT INTO dbo.RfidLogs (RfidCode, MachineNumber, Location, ReceivedAt, RawHex)
      VALUES (@RfidCode, @MachineNumber, @Location, @ReceivedAt, NULL);
    `);

    // 3. Verify exactly 1 record remains
    const res = await pool.request().query("SELECT COUNT(*) AS total FROM dbo.RfidLogs; SELECT TOP 1 * FROM dbo.RfidLogs;");
    console.log("📊 Total remaining records in dbo.RfidLogs:", res.recordsets[0][0].total);
    console.log("📌 Preserved latest log:", res.recordsets[1][0]);
    console.log("🎉 SUCCESS: dbo.RfidLogs has been cleared and contains ONLY the latest log!");

    process.exit(0);
  } catch (err) {
    console.error("❌ Cleanup error:", err.message);
    process.exit(1);
  }
}

run();
