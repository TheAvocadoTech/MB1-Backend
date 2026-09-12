require("dotenv").config();
const sql = require("mssql");

const config = {
  server: process.env.DB_SERVER || "localhost",
  database: "master", // Connect to master so it never waits on LLD DB lock
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
  console.log("Connected to master!");

  const res = await pool.request().query(`
    SELECT 
      w.session_id, 
      w.wait_duration_ms, 
      w.wait_type, 
      w.blocking_session_id, 
      r.command, 
      r.status,
      r.percent_complete
    FROM sys.dm_os_waiting_tasks w
    LEFT JOIN sys.dm_exec_requests r ON w.session_id = r.session_id
    WHERE w.session_id > 50;
  `);
  console.log("Waiting tasks:", res.recordset);

  const activeSessions = await pool.request().query(`
    SELECT s.session_id, s.login_name, s.status, s.last_request_start_time, c.client_net_address
    FROM sys.dm_exec_sessions s
    LEFT JOIN sys.dm_exec_connections c ON s.session_id = c.session_id
    WHERE s.is_user_process = 1 AND s.session_id != @@SPID;
  `);
  console.log("Active user sessions:", activeSessions.recordset);

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
