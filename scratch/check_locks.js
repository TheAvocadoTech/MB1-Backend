require("dotenv").config();
const sql = require("mssql");

const config = {
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_NAME || "LLD",
  user: process.env.DB_USER || "node_user",
  password: process.env.DB_PASSWORD || "YourStrongPassword123!",
  options: {
    trustServerCertificate: true,
    encrypt: false,
    instanceName: "SQLEXPRESS",
  },
};

async function main() {
  const pool = await new sql.ConnectionPool(config).connect();
  const locks = await pool.request().query(`
    SELECT 
      request_session_id, 
      resource_type, 
      request_mode, 
      request_status 
    FROM sys.dm_tran_locks 
    WHERE resource_database_id = DB_ID('LLD')
  `);
  console.log("Active locks:", locks.recordset);

  const sessions = await pool.request().query(`
    SELECT session_id, login_name, status, last_request_start_time 
    FROM sys.dm_exec_sessions 
    WHERE is_user_process = 1 AND session_id != @@SPID
  `);
  console.log("Other user sessions:", sessions.recordset);

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
