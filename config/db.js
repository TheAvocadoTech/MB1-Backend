// config/db.js
const sql = require("mssql");

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // port: 1433, // Explicitly specify port
  options: {
    trustServerCertificate: true,
    encrypt: false,
    enableArithAbort: true,
    connectionTimeout: 30000,
    requestTimeout: 30000,
    // Add these options
    instanceName: "SQLEXPRESS", // Specify instance name explicitly
    connectTimeout: 30000,
    cancelTimeout: 30000,
  },
};

// Add connection retry logic
let pool = null;
let retryCount = 0;
const MAX_RETRIES = 3;

async function connectDB() {
  if (pool) {
    console.log("🔄 Using existing database connection");
    return pool;
  }

  try {
    console.log(
      `🔄 Connecting to SQL Server (Attempt ${retryCount + 1}/${MAX_RETRIES})...`,
    );
    console.log(`   Server: ${config.server}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);

    pool = await sql.connect(config);
    console.log("✅ SQL Server Connected Successfully!");

    // Test the connection
    const result = await pool
      .request()
      .query("SELECT @@VERSION as version, DB_NAME() as databaseName");
    console.log(
      `📊 Connected to Database: ${result.recordset[0].databaseName}`,
    );

    // Auto-create missing database tables
    await initDBTables(pool);

    retryCount = 0; // Reset retry count on success
    return pool;
  } catch (err) {
    retryCount++;
    console.error(
      `❌ Connection Error (Attempt ${retryCount}/${MAX_RETRIES}):`,
      err.message,
    );

    if (retryCount < MAX_RETRIES) {
      console.log(`⏳ Waiting 3 seconds before retry...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return connectDB(); // Retry
    }

    // Provide detailed troubleshooting
    console.error("\n🔍 Detailed Troubleshooting Guide:");
    console.error("1. Check if SQL Server is running:");
    console.error("   Run: sc query MSSQL$TEST");
    console.error("   If not running, run: net start MSSQL$TEST");
    console.error("\n2. Check TCP/IP is enabled:");
    console.error("   Open SQL Server Configuration Manager");
    console.error("   → SQL Server Network Configuration");
    console.error("   → Protocols for TEST");
    console.error("   → TCP/IP should be Enabled");
    console.error("\n3. Check port 1433 is open:");
    console.error("   Run: netstat -ano | findstr 1433");
    console.error("   Should show LISTENING");
    console.error("\n4. Check Windows Firewall:");
    console.error(
      '   Run as Admin: netsh advfirewall firewall add rule name="SQL Server 1433" dir=in action=allow protocol=TCP localport=1433',
    );
    console.error("\n5. Try connecting with SSMS first using:");
    console.error(`   Server: ${config.server}`);
    console.error(`   Authentication: SQL Server Authentication`);
    console.error(`   Login: ${config.user}`);
    console.error(`   Password: [your password]`);

    throw err;
  }
}

/**
 * Automatically check & create all missing database tables on startup
 */
async function initDBTables(pool) {
  try {
    const tableQueries = `
      -- 1. Users Table
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Users]') AND type in (N'U'))
      BEGIN
        CREATE TABLE Users (
          UserID INT IDENTITY(1,1) PRIMARY KEY,
          FullName NVARCHAR(255) NOT NULL,
          Email NVARCHAR(255) NOT NULL UNIQUE,
          Password NVARCHAR(255) NOT NULL,
          Role NVARCHAR(50) DEFAULT 'Receptionist',
          IsActive BIT DEFAULT 1,
          CreatedBy INT NULL,
          CreatedAt DATETIME DEFAULT GETDATE(),
          UpdatedAt DATETIME NULL,
          DeletedAt DATETIME NULL
        );
        PRINT 'Created Users table';
      END

      -- 2. Companies Table
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Companies]') AND type in (N'U'))
      BEGIN
        CREATE TABLE Companies (
          CompanyID INT IDENTITY(1,1) PRIMARY KEY,
          CompanyName NVARCHAR(255) NOT NULL UNIQUE,
          ContactPerson NVARCHAR(150) NULL,
          Email NVARCHAR(255) NULL,
          Phone NVARCHAR(50) NULL,
          Address NVARCHAR(MAX) NULL,
          Industry NVARCHAR(100) NULL,
          Website NVARCHAR(255) NULL,
          IsActive BIT DEFAULT 1,
          CreatedBy INT NULL,
          CreatedAt DATETIME DEFAULT GETDATE(),
          UpdatedAt DATETIME NULL,
          DeletedAt DATETIME NULL
        );
        PRINT 'Created Companies table';
      END

      -- 3. IdTags Table (Physical Hardware Inventory)
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[IdTags]') AND type in (N'U'))
      BEGIN
        CREATE TABLE IdTags (
          TagID INT IDENTITY(1,1) PRIMARY KEY,
          IdNumber NVARCHAR(100) NOT NULL UNIQUE,
          Nickname NVARCHAR(150) NOT NULL,
          RfidCodeHex VARCHAR(100) NULL,
          IsActive BIT DEFAULT 1,
          CreatedBy INT NULL,
          CreatedAt DATETIME DEFAULT GETDATE(),
          UpdatedAt DATETIME NULL,
          DeletedAt DATETIME NULL
        );
        PRINT 'Created IdTags table';
      END

      -- 4. IdManagement Table (Permanent Directory & Visit Ledger)
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[IdManagement]') AND type in (N'U'))
      BEGIN
        CREATE TABLE IdManagement (
          IdManagementID INT IDENTITY(1,1) PRIMARY KEY,
          VisitorName NVARCHAR(255) NOT NULL,
          PhoneNumber NVARCHAR(50) NOT NULL,
          Email NVARCHAR(255) NULL,
          Company NVARCHAR(255) NULL,
          Purpose NVARCHAR(MAX) NULL,
          IdType NVARCHAR(50) DEFAULT 'Visitor',
          IdNumber NVARCHAR(100) NULL,
          ValidFrom DATETIME DEFAULT GETDATE(),
          ValidUntil DATETIME NULL,
          Status NVARCHAR(50) DEFAULT 'Registered',
          IsActive BIT DEFAULT 1,
          CreatedBy INT NULL,
          CreatedAt DATETIME DEFAULT GETDATE(),
          UpdatedAt DATETIME NULL,
          DeletedAt DATETIME NULL,
          RfidCode VARCHAR(100) NULL,
          QrToken VARCHAR(100) NULL,
          RfidCodeHex VARCHAR(100) NULL
        );
        PRINT 'Created IdManagement table';
      END

      -- 5. RfidLogs Table (Hardware Scanner Logs)
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[RfidLogs]') AND type in (N'U'))
      BEGIN
        CREATE TABLE RfidLogs (
          LogID INT IDENTITY(1,1) PRIMARY KEY,
          TagCode NVARCHAR(100) NULL,
          RfidCodeHex VARCHAR(100) NULL,
          ReaderID NVARCHAR(50) NULL,
          RawHex NVARCHAR(MAX) NULL,
          Rssi INT NULL,
          ScannedAt DATETIME DEFAULT GETDATE(),
          IdManagementID INT NULL
        );
        PRINT 'Created RfidLogs table';
      END
    `;

    await pool.request().query(tableQueries);
    console.log("⚡ Database tables auto-initialization check completed!");
  } catch (tableErr) {
    console.error("⚠️ Database auto-table creation notice:", tableErr.message);
  }
}

module.exports = { connectDB, sql };
