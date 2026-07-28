const { connectDB, sql } = require("../config/db");

let isTableVerified = false;

class RfidLogModel {
  /**
   * Ensure RfidLogs table exists in SQL Server (Atomic check)
   */
  static async ensureTableExists() {
    if (isTableVerified) return;
    isTableVerified = true; // Set flag immediately to prevent concurrent duplicate checks
    try {
      const pool = await connectDB();
      const checkQuery = `
        IF OBJECT_ID('dbo.RfidLogs', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.RfidLogs (
                LogID INT IDENTITY(1,1) PRIMARY KEY,
                RfidCode VARCHAR(100) NOT NULL,
                MachineNumber VARCHAR(50) NOT NULL,
                Location VARCHAR(100) NULL,
                ReceivedAt DATETIME DEFAULT GETDATE(),
                RawHex VARCHAR(255) NULL
            );
        END
      `;
      await pool.request().query(checkQuery);
      console.log("✅ [SQL MODEL] RfidLogs table verified/ready");
    } catch (error) {
      console.error("❌ [SQL MODEL] Error ensuring RfidLogs table exists:", error);
    }
  }

  /**
   * Insert new RFID scan log entry into SQL Server database
   */
  static async createLog({ rfid_code, machine_number, location, received_at, rawHex }) {
    try {
      await this.ensureTableExists();
      const pool = await connectDB();
      const request = pool.request();

      request.input("RfidCode", sql.VarChar(100), rfid_code || "");
      request.input("MachineNumber", sql.VarChar(50), String(machine_number || ""));
      request.input("Location", sql.VarChar(100), location || "Unknown");
      request.input("ReceivedAt", sql.DateTime, received_at ? new Date(received_at) : new Date());
      request.input("RawHex", sql.VarChar(255), rawHex || null);

      const query = `
        INSERT INTO dbo.RfidLogs (RfidCode, MachineNumber, Location, ReceivedAt, RawHex)
        VALUES (@RfidCode, @MachineNumber, @Location, @ReceivedAt, @RawHex);
        SELECT SCOPE_IDENTITY() AS LogID;
      `;

      const result = await request.query(query);
      const logId = result.recordset[0]?.LogID;
      console.log(`💾 [SQL DATABASE] RFID Log saved to database with LogID #${logId}`);
      return { success: true, logId };
    } catch (error) {
      console.error("❌ [SQL DATABASE] Failed to save RFID Log to database:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all scan logs from SQL database
   */
  static async getAllLogs() {
    try {
      await this.ensureTableExists();
      const pool = await connectDB();
      const result = await pool.request().query(`
        SELECT TOP 500 LogID, RfidCode, MachineNumber, Location, ReceivedAt, RawHex
        FROM dbo.RfidLogs
        ORDER BY ReceivedAt DESC
      `);
      return result.recordset || [];
    } catch (error) {
      console.error("❌ [SQL DATABASE] Error fetching RFID Logs:", error);
      return [];
    }
  }
}

module.exports = RfidLogModel;
