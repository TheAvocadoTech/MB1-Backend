require('dotenv').config();
const { connectDB, sql } = require('../config/db');

async function runMigration() {
  const pool = await connectDB();
  console.log("🔄 Running DB Schema Migrations for Company and IdTags...");

  // 1. Alter Companies table: make ContactPerson, Email, Phone, Address, Industry, Website nullable
  try {
    await pool.request().query(`
      IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Companies' AND COLUMN_NAME = 'ContactPerson' AND IS_NULLABLE = 'NO'
      )
      BEGIN
        ALTER TABLE Companies ALTER COLUMN ContactPerson NVARCHAR(150) NULL;
        PRINT '✅ Altered Companies.ContactPerson to NULLABLE';
      END
    `);
  } catch (err) {
    console.warn("⚠️ Warning altering Companies table:", err.message);
  }

  // 2. Create IdTags table if not exists
  try {
    await pool.request().query(`
      IF OBJECT_ID('dbo.IdTags', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.IdTags (
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
        PRINT '✅ Created IdTags table';
      END
    `);

    // Populate IdTags from existing IdManagement distinct IdNumbers if IdTags is empty
    const countRes = await pool.request().query(`SELECT COUNT(*) as total FROM IdTags WHERE IsActive = 1`);
    if (countRes.recordset[0].total === 0) {
      await pool.request().query(`
        INSERT INTO IdTags (IdNumber, Nickname)
        VALUES 
          ('V001', 'Visitor Tag 1'),
          ('V002', 'Visitor Tag 2'),
          ('Tag1', 'Visitor Badge 1'),
          ('Tag2', 'Visitor Badge 2'),
          ('09]ú', 'Staff Demo Tag');
        PRINT '✅ Seeded initial default IdTags';
      `);
    }
  } catch (err) {
    console.warn("⚠️ Warning creating IdTags table:", err.message);
  }

  console.log("🎉 Migration completed successfully.");
}

runMigration().then(() => process.exit(0)).catch(e => { console.error("Migration failed:", e); process.exit(1); });
