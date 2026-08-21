require('dotenv').config();
const { connectDB, sql } = require('../config/db');

async function testFix() {
  const pool = await connectDB();

  // Create Tag
  await pool.request().query("INSERT INTO IdTags (IdNumber, Nickname) VALUES ('TZ_TAG_2', 'Timezone Test Tag 2')");

  // Create Visitor with local midnight string
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const localMidnightStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 23:59:59.999`;

  console.log("Local Midnight String to insert:", localMidnightStr);

  await pool.request().query(`
    INSERT INTO IdManagement (VisitorName, PhoneNumber, IdNumber, ValidFrom, ValidUntil, Status, IsActive)
    VALUES ('Jane Test', '9876543210', 'TZ_TAG_2', GETDATE(), '${localMidnightStr}', 'Active', 1)
  `);

  // Query Tag status
  const res = await pool.request().query(`
    SELECT 
      t.TagID,
      t.IdNumber,
      t.Nickname,
      activeVis.VisitorName as AssignedVisitorName,
      activeVis.ValidUntil as ActiveUntil,
      CASE WHEN activeVis.IdManagementID IS NOT NULL THEN 0 ELSE 1 END as IsAvailable
    FROM IdTags t
    OUTER APPLY (
      SELECT TOP 1 i.IdManagementID, i.VisitorName, i.ValidUntil
      FROM IdManagement i
      WHERE i.IdNumber = t.IdNumber 
        AND i.IsActive = 1 
        AND i.Status = 'Active'
        AND (i.ValidUntil IS NULL OR i.ValidUntil > GETDATE())
      ORDER BY i.CreatedAt DESC
    ) activeVis
    WHERE t.IdNumber = 'TZ_TAG_2'
  `);

  console.log("Tag Status Output:", res.recordset[0]);

  // Clean up
  await pool.request().query("DELETE FROM IdManagement WHERE IdNumber = 'TZ_TAG_2'");
  await pool.request().query("DELETE FROM IdTags WHERE IdNumber = 'TZ_TAG_2'");
}

testFix().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
