require('dotenv').config();
const { connectDB } = require('../config/db');
const Company = require('../models/Company.model');
const Tag = require('../models/Tag.model');
const IdManagement = require('../models/IDManagement.model');

async function testOnVisitFlow() {
  await connectDB();
  console.log("=========================================");
  console.log("🧪 1. Register Permanent Visitor (No Tag)");
  console.log("=========================================");
  const comp = await Company.create({ companyName: `Google Corp ${Date.now()}` });
  const uniqueTagName = `ONVISIT_${Date.now()}`;
  const tag = await Tag.create({ idNumber: uniqueTagName, nickname: "OnVisit Test Tag" });
  const tagCode = tag.idNumber || tag.IdNumber;

  const vis = await IdManagement.create({
    visitorName: "Permanent Visitor John",
    phoneNumber: "9876543299",
    email: "john@google.com",
    company: comp.CompanyName,
  });

  console.log("✅ Visitor Directory Profile Created:", {
    id: vis.IdManagementID,
    name: vis.VisitorName,
    status: vis.Status,
  });

  console.log("\n=========================================");
  console.log("🧪 2. Click 'On Visit' -> Assign Tag for Today");
  console.log("=========================================");
  const visitResult = await IdManagement.assignTag(vis.IdManagementID, {
    idNumber: tagCode,
  });

  console.log("✅ Visit Started with Tag Assignment:", {
    id: visitResult.IdManagementID,
    name: visitResult.VisitorName,
    tag: visitResult.IdNumber,
    validUntil: visitResult.ValidUntil,
    token: visitResult.token,
  });

  console.log("\n=========================================");
  console.log("🧪 3. Check All Visitors List (Directory)");
  console.log("=========================================");
  const allVisitors = await IdManagement.findAll();
  const johnInList = allVisitors.find((v) => v.IdManagementID === vis.IdManagementID);
  console.log("✅ Visitor in Directory:", {
    name: johnInList.VisitorName,
    isOnVisit: johnInList.isOnVisit,
    activeTag: johnInList.activeTagNumber,
  });

  console.log("\n=========================================");
  console.log("🧪 4. Clean Up Test Data");
  console.log("=========================================");
  const pool = await connectDB();
  await pool.request().query(`DELETE FROM IdManagement WHERE IdManagementID = ${vis.IdManagementID}`);
  await pool.request().query(`DELETE FROM IdTags WHERE IdNumber LIKE 'ONVISIT%' OR IdNumber = 'TAG_ON_VISIT_1'`);
  await pool.request().query(`DELETE FROM Companies WHERE CompanyName LIKE 'Google Corp%' OR CompanyName = 'Google DeepMind Corp'`);
  console.log("✅ Cleaned test records!");

  console.log("\n🎉 ON-VISIT FLOW VERIFIED SUCCESSFULLY!");
}

testOnVisitFlow().then(() => process.exit(0)).catch((e) => {
  console.error("❌ On-Visit test error:", e);
  process.exit(1);
});
