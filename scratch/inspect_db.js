require('dotenv').config();
const { connectDB } = require('../config/db');

async function inspect() {
  const pool = await connectDB();
  const ids = await pool.request().query('SELECT * FROM IdManagement');
  const comps = await pool.request().query('SELECT * FROM Companies');
  console.log("=== IdManagement records ===");
  console.log(ids.recordset);
  console.log("=== Companies records ===");
  console.log(comps.recordset);
}

inspect().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
