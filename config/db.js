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

module.exports = { connectDB, sql };
