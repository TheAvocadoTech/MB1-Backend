const { connectDB, sql } = require("../config/db");

let ensureTablePromise = null;

class RfidLogModel {
  /**
   * Ensure RfidLogs table exists in SQL Server (Atomic check)
   */
  static async ensureTableExists() {
    if (ensureTablePromise) return ensureTablePromise;
    ensureTablePromise = (async () => {
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
        ensureTablePromise = null; // Reset on failure to allow retry on next call
        console.error("❌ [SQL MODEL] Error ensuring RfidLogs table exists:", error);
        throw error;
      }
    })();
    return ensureTablePromise;
  }

  /**
   * Insert new RFID scan log entry into SQL Server database
   */
  static async createLog(params) {
    try {
      await this.ensureTableExists();
      const pool = await connectDB();
      const request = pool.request();

      const rfidCode = params.rfidCode || params.rfid_code || "";
      const machineNumber = params.machineNumber || params.machine_number || "";
      const location = params.location || "Unknown";
      const receivedAt = params.receivedAt || params.received_at ? new Date(params.receivedAt || params.received_at) : new Date();
      const rawHex = params.rawHex || null;

      request.input("RfidCode", sql.VarChar(100), rfidCode);
      request.input("MachineNumber", sql.VarChar(50), String(machineNumber));
      request.input("Location", sql.VarChar(100), location);
      request.input("ReceivedAt", sql.DateTime, receivedAt);
      request.input("RawHex", sql.VarChar(255), rawHex);

      const query = `
        INSERT INTO dbo.RfidLogs (RfidCode, MachineNumber, Location, ReceivedAt, RawHex)
        VALUES (@RfidCode, @MachineNumber, @Location, @ReceivedAt, @RawHex);
        DECLARE @NewLogID INT = SCOPE_IDENTITY();

        -- Maintain 50-item FIFO queue: delete any records older than the latest 50
        DELETE FROM dbo.RfidLogs
        WHERE LogID IN (
            SELECT LogID
            FROM dbo.RfidLogs
            ORDER BY LogID DESC
            OFFSET 50 ROWS
        );

        SELECT @NewLogID AS LogID;
      `;

      const result = await request.query(query);
      const logId = result.recordset[0]?.LogID;
      console.log(`💾 [SQL DATABASE] RFID Log saved to queue with LogID #${logId} (capped at 50)`);
      return { success: true, logId };
    } catch (error) {
      console.error("❌ [SQL DATABASE] Failed to save RFID Log to database:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all scan logs from SQL database except the single latest one
   */
  static async clearExceptLatest() {
    try {
      await this.ensureTableExists();
      const pool = await connectDB();
      const query = `
        IF EXISTS (SELECT 1 FROM dbo.RfidLogs)
        BEGIN
            IF OBJECT_ID('tempdb..#LatestLog') IS NOT NULL DROP TABLE #LatestLog;
            SELECT TOP 1 LogID, RfidCode, MachineNumber, Location, ReceivedAt, RawHex
            INTO #LatestLog
            FROM dbo.RfidLogs
            ORDER BY LogID DESC;

            TRUNCATE TABLE dbo.RfidLogs;

            SET IDENTITY_INSERT dbo.RfidLogs ON;
            INSERT INTO dbo.RfidLogs (LogID, RfidCode, MachineNumber, Location, ReceivedAt, RawHex)
            SELECT LogID, RfidCode, MachineNumber, Location, ReceivedAt, RawHex
            FROM #LatestLog;
            SET IDENTITY_INSERT dbo.RfidLogs OFF;

            DROP TABLE #LatestLog;
        END

        SELECT COUNT(*) AS remainingCount FROM dbo.RfidLogs;
      `;
      const result = await pool.request().query(query);
      const remainingCount = result.recordset[0]?.remainingCount || 0;
      console.log(`🧹 [SQL DATABASE] Cleared all RFID logs except the latest. Remaining records: ${remainingCount}`);
      return { success: true, remainingCount };
    } catch (error) {
      console.error("❌ [SQL DATABASE] Error clearing RFID logs:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get single latest scan log from SQL database
   */
  static async getLatestLog() {
    try {
      await this.ensureTableExists();
      const pool = await connectDB();
      const result = await pool.request().query(`
        SELECT TOP 1 LogID, RfidCode, MachineNumber, Location, ReceivedAt, RawHex
        FROM dbo.RfidLogs
        ORDER BY LogID DESC
      `);
      return result.recordset[0] || null;
    } catch (error) {
      console.error("❌ [SQL DATABASE] Error fetching latest RFID Log:", error);
      return null;
    }
  }

  /**
   * Get all scan logs from SQL database (up to 50 items in FIFO queue)
   */
  static async getAllLogs() {
    try {
      await this.ensureTableExists();
      const pool = await connectDB();
      const result = await pool.request().query(`
        SELECT TOP 50 LogID, RfidCode, MachineNumber, Location, ReceivedAt, RawHex
        FROM dbo.RfidLogs
        ORDER BY LogID DESC
      `);
      return result.recordset || [];
    } catch (error) {
      console.error("❌ [SQL DATABASE] Error fetching RFID Logs:", error);
      return [];
    }
  }
}

module.exports = RfidLogModel;
