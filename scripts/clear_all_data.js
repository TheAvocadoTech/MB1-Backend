require('dotenv').config();
const { connectDB } = require('../config/db');

async function clearData() {
  const pool = await connectDB();
  console.log("🧹 Clearing all existing visitors, companies, ID tags, and RFID logs...");

  try {
    // Truncate tables for instant cleanup
    await pool.request().query(`TRUNCATE TABLE RfidLogs;`);
    console.log("✅ Cleared RfidLogs table");

    await pool.request().query(`DELETE FROM IdManagement;`);
    console.log("✅ Cleared IdManagement table (Visitors)");

    await pool.request().query(`DELETE FROM IdTags;`);
    console.log("✅ Cleared IdTags table (ID Tags)");

    await pool.request().query(`DELETE FROM Companies;`);
    console.log("✅ Cleared Companies table (Companies)");

    // Reseed auto-increment IDs back to 0
    try {
      await pool.request().query(`DBCC CHECKIDENT ('IdManagement', RESEED, 0);`);
      await pool.request().query(`DBCC CHECKIDENT ('IdTags', RESEED, 0);`);
      await pool.request().query(`DBCC CHECKIDENT ('Companies', RESEED, 0);`);
      await pool.request().query(`DBCC CHECKIDENT ('RfidLogs', RESEED, 0);`);
      console.log("✅ Reseeded table ID counters to 0");
    } catch (reseedErr) {
      console.warn("⚠️ Reseed notice:", reseedErr.message);
    }

    console.log("\n🎉 ALL TEST DATA CLEARED SUCCESSFULLY! (User accounts preserved)");
  } catch (err) {
    console.error("❌ Error clearing data:", err.message);
    throw err;
  }
}

clearData().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
