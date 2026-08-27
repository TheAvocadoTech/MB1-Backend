// scratch/test_session_expiry_fix.js
require('dotenv').config();
const { connectDB, sql } = require('../config/db');
const IdManagement = require('../models/IDManagement.model');
const Tag = require('../models/Tag.model');
const rfidTrackerService = require('../services/rfidTracker.service');

async function runTests() {
  console.log("🚀 Starting Session Expiry & Auto-Release Verification Tests...\n");
  const pool = await connectDB();

  const testTag = "TEST_EXP_01";
  const testVisitorName = "Session Expiry Test Visitor";

  // Clean up any previous test artifacts
  await pool.request().query(`DELETE FROM IdManagement WHERE VisitorName = '${testVisitorName}' OR IdNumber = '${testTag}'`);
  await pool.request().query(`DELETE FROM IdTags WHERE IdNumber = '${testTag}'`);

  try {
    // 1. Create a Tag
    console.log("1️⃣ Creating test ID Tag...");
    const tag = await Tag.create({ idNumber: testTag, nickname: "Test Expiry Tag" });
    console.log("   ✅ Tag created:", tag.IdNumber);

    // 2. Create an Old/Completed Visit with this tag to test prioritization
    console.log("\n2️⃣ Creating old completed visit in history for same tag...");
    await pool.request().query(`
      INSERT INTO IdManagement (VisitorName, PhoneNumber, Company, IdNumber, ValidFrom, ValidUntil, Status, IsActive, QrToken, CreatedAt, UpdatedAt)
      VALUES ('Old Visitor', '1111111111', 'Old Co', '${testTag}', DATEADD(day, -2, GETDATE()), DATEADD(day, -2, GETDATE()), 'Completed', 1, 'VTK_OLD_EXPIRED', DATEADD(day, -2, GETDATE()), DATEADD(day, -2, GETDATE()))
    `);

    // 3. Create a New Active Visitor
    console.log("\n3️⃣ Creating new visitor...");
    const visitor = await IdManagement.create({
      visitorName: testVisitorName,
      phoneNumber: "9998887770",
      company: "Acme Corp",
      status: "Active"
    });
    console.log("   ✅ Visitor created with ID:", visitor.IdManagementID);

    // 4. Assign Tag ("On Visit" button action)
    console.log("\n4️⃣ Assigning Tag to visitor ('On Visit' action)...");
    const assigned = await IdManagement.assignTag(visitor.IdManagementID, {
      idNumber: testTag,
      company: "Acme Corp"
    });
    console.log("   ✅ Assigned Tag:", assigned.IdNumber, "| Token:", assigned.token);

    // 5. Test findByToken prioritization
    console.log("\n5️⃣ Testing findByToken resolution...");
    const foundRecord = await IdManagement.findByToken(assigned.token);
    console.log("   ✅ Record Found by Token:", {
      id: foundRecord.IdManagementID,
      visitorName: foundRecord.VisitorName,
      status: foundRecord.Status,
      tag: foundRecord.IdNumber,
      token: foundRecord.QrToken
    });

    if (foundRecord.IdManagementID !== visitor.IdManagementID || foundRecord.Status !== 'Active') {
      throw new Error("❌ findByToken picked the wrong record or inactive status!");
    }

    // 6. Test rfidTrackerService.getLivePathByToken (Map polling response)
    console.log("\n6️⃣ Testing rfidTrackerService.getLivePathByToken map session...");
    const livePath = await rfidTrackerService.getLivePathByToken(assigned.token);
    console.log("   ✅ Map Live Response:", {
      visitorName: livePath.visitorName,
      tagCode: livePath.tagCode,
      company: livePath.company,
      isExpired: livePath.isExpired,
      progressPercent: livePath.progressPercent
    });

    if (livePath.isExpired === true) {
      throw new Error("❌ Map session is incorrectly showing isExpired: true during active visit!");
    }
    console.log("   🎉 SUCCESS: Map session is ACTIVE (isExpired: false)!");

    // 7. Test Manual End Visit ("End Visit" button action)
    console.log("\n7️⃣ Testing Manual 'End Visit' button release...");
    const ended = await IdManagement.endVisit(visitor.IdManagementID);
    console.log("   ✅ Visit ended:", { status: ended.Status, tag: ended.IdNumber });

    const livePathAfterEnd = await rfidTrackerService.getLivePathByToken(assigned.token);
    console.log("   ✅ Live Path after End Visit isExpired:", livePathAfterEnd.isExpired);

    if (livePathAfterEnd.isExpired !== true) {
      throw new Error("❌ Session did not expire after manual End Visit button click!");
    }
    console.log("   🎉 SUCCESS: Session expired immediately upon manual release!");

    // 8. Test Midnight Auto-Release
    console.log("\n8️⃣ Testing Midnight Auto-Release method...");
    // Create an artificial past visit
    await pool.request().query(`
      INSERT INTO IdManagement (VisitorName, PhoneNumber, Company, IdNumber, ValidFrom, ValidUntil, Status, IsActive, QrToken)
      VALUES ('Midnight Test Visitor', '2222222222', 'Test Co', '${testTag}', DATEADD(day, -1, GETDATE()), DATEADD(second, -10, GETDATE()), 'Active', 1, 'VTK_MIDNIGHT_TEST')
    `);

    const releasedCount = await IdManagement.autoReleaseExpiredVisits();
    console.log(`   ✅ Released ${releasedCount} past visit(s)`);

    const checkReleased = await pool.request().query(`SELECT Status, IdNumber FROM IdManagement WHERE QrToken = 'VTK_MIDNIGHT_TEST'`);
    console.log("   ✅ Status after auto-release:", checkReleased.recordset[0]);

    if (checkReleased.recordset[0].Status !== 'Completed' || checkReleased.recordset[0].IdNumber !== null) {
      throw new Error("❌ Auto-release did not set status to Completed and clear IdNumber!");
    }
    console.log("   🎉 SUCCESS: Midnight Auto-Release verified!");

    console.log("\n🌟 ALL TESTS PASSED SUCCESSFULLY! 🌟\n");
  } finally {
    // Clean up test data
    await pool.request().query(`DELETE FROM IdManagement WHERE VisitorName = '${testVisitorName}' OR IdNumber = '${testTag}' OR VisitorName LIKE '%Test Visitor%'`);
    await pool.request().query(`DELETE FROM IdTags WHERE IdNumber = '${testTag}'`);
  }
}

runTests().then(() => process.exit(0)).catch(err => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
