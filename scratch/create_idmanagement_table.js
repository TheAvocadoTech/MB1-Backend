require('dotenv').config();
const { connectDB } = require('../config/db');

async function createTable() {
  const pool = await connectDB();
  const query = `
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
        Status NVARCHAR(50) DEFAULT 'Active',
        IsActive BIT DEFAULT 1,
        CreatedBy INT NULL,
        CreatedAt DATETIME DEFAULT GETDATE(),
        UpdatedAt DATETIME NULL,
        DeletedAt DATETIME NULL,
        RfidCode VARCHAR(100) NULL,
        QrToken VARCHAR(100) NULL,
        RfidCodeHex VARCHAR(100) NULL
      );
      PRINT 'IdManagement table created!';
    END
  `;
  await pool.request().query(query);
  console.log("✅ IdManagement table verified/created in database!");
}

createTable().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
