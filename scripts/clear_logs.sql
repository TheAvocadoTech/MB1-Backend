-- scripts/clear_logs.sql
USE LLD;
GO

-- 1. Create clean queue table if not exists
IF OBJECT_ID('dbo.RfidLogsQueue', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RfidLogsQueue (
        LogID INT IDENTITY(1,1) PRIMARY KEY,
        RfidCode VARCHAR(100) NOT NULL,
        MachineNumber VARCHAR(50) NOT NULL,
        Location VARCHAR(100) NULL,
        ReceivedAt DATETIME DEFAULT GETDATE(),
        RawHex VARCHAR(255) NULL
    );
END
GO

-- 2. Fast truncate the queue table
TRUNCATE TABLE dbo.RfidLogsQueue;
GO

-- 3. Insert the latest location scan (V002 at Man Trap)
INSERT INTO dbo.RfidLogsQueue (RfidCode, MachineNumber, Location, ReceivedAt, RawHex)
VALUES ('563030320CE2806995200050', '38', 'Man Trap', GETDATE(), NULL);
GO

-- 4. Verify result
SELECT COUNT(*) AS TotalInQueue FROM dbo.RfidLogsQueue;
SELECT TOP 1 * FROM dbo.RfidLogsQueue;
GO
