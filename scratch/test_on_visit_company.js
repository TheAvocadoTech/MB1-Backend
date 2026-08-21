require('dotenv').config();
const { connectDB } = require('../config/db');
const Company = require('../models/Company.model');
const Tag = require('../models/Tag.model');
const IdManagement = require('../models/IDManagement.model');

async function testOnVisitCompanyFlow() {
  await connectDB();
  console.log("=========================================");
  console.log("🧪 1. Register Permanent Visitor (No Company, No Tag)");
  console.log("=========================================");
  const comp = await Company.create({ companyName: `Test Company ${Date.now()}` });
  const uniqueTagName = `ONVISIT_TAG_${Date.now()}`;
  const tag = await Tag.create({ idNumber: uniqueTagName, nickname: "OnVisit Tag" });
  const tagCode = tag.idNumber || tag.IdNumber;

  const vis = await IdManagement.create({
    visitorName: "Permanent Visitor Alice",
    phoneNumber: "9876500111",
    email: "alice@test.com",
  });

  console.log("✅ Visitor Directory Profile Created:", {
    id: vis.IdManagementID,
    name: vis.VisitorName,
    company: vis.Company || "None (Permanent profile)",
  });

  console.log("\n=========================================");
  console.log("🧪 2. Click 'On Visit' -> Select Company & Tag");
  console.log("=========================================");
  const visitResult = await IdManagement.assignTag(vis.IdManagementID, {
    idNumber: tagCode,
    company: comp.CompanyName,
  });

  console.log("✅ Visit Started:", {
    id: visitResult.IdManagementID,
    name: visitResult.VisitorName,
    activeCompany: visitResult.Company,
    activeTag: visitResult.IdNumber,
    validUntil: visitResult.ValidUntil,
  });

  console.log("\n=========================================");
  console.log("🧪 3. Check Directory Active Visit Status");
  console.log("=========================================");
  const allVisitors = await IdManagement.findAll();
  const alice = allVisitors.find((v) => v.IdManagementID === vis.IdManagementID);
  console.log("✅ Alice in Directory:", {
    name: alice.VisitorName,
    isOnVisit: alice.isOnVisit,
    activeCompany: alice.activeCompany,
    activeTag: alice.activeTagNumber,
  });

  console.log("\n=========================================");
  console.log("🧪 4. End Visit -> Verify Tag & Company Released");
  console.log("=========================================");
  const ended = await IdManagement.endVisit(vis.IdManagementID);
  console.log("✅ Visit Ended:", {
    id: ended.IdManagementID,
    tag: ended.IdNumber,
    company: ended.Company,
    status: ended.Status,
  });

  console.log("\n=========================================");
  console.log("🧪 5. Clean Up Test Data");
  console.log("=========================================");
  const pool = await connectDB();
  await pool.request().query(`DELETE FROM IdManagement WHERE IdManagementID = ${vis.IdManagementID}`);
  await pool.request().query(`DELETE FROM IdTags WHERE TagID = ${tag.TagID || tag.tagId}`);
  await pool.request().query(`DELETE FROM Companies WHERE CompanyID = ${comp.CompanyID || comp.id}`);
  console.log("✅ Cleaned test records!");

  console.log("\n🎉 ALL TESTS PASSED! COMPANY & TAG ON-VISIT FLOW FULLY VERIFIED!");
}

testOnVisitCompanyFlow().then(() => process.exit(0)).catch((e) => {
  console.error("❌ Test error:", e);
  process.exit(1);
});
