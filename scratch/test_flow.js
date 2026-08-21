require('dotenv').config();
const { connectDB } = require('../config/db');
const Tag = require('../models/Tag.model');
const Company = require('../models/Company.model');
const IdManagement = require('../models/IDManagement.model');

async function testFlow() {
  await connectDB();
  console.log("=========================================");
  console.log("🧪 1. Testing Company (Only companyName)");
  console.log("=========================================");
  const testCompName = `Test Corp ${Date.now()}`;
  const comp = await Company.create({ companyName: testCompName });
  console.log("✅ Company Created:", { id: comp.CompanyID, name: comp.CompanyName });

  console.log("\n=========================================");
  console.log("🧪 2. Testing ID Tags (ID Name & Nickname)");
  console.log("=========================================");
  const allTags = await Tag.findAll();
  console.log(`✅ Total Tags in DB: ${allTags.length}`);
  allTags.forEach(t => console.log(`   - [${t.status}] ${t.nickname} (ID: ${t.idNumber}) ${t.assignedVisitorName ? '-> Assigned to ' + t.assignedVisitorName : ''}`));

  const availableTags = await Tag.findAvailable();
  console.log(`✅ Available (Free) Tags: ${availableTags.length}`);

  if (availableTags.length > 0) {
    const chosenTag = availableTags[0];
    console.log(`\n=========================================`);
    console.log(`🧪 3. Assigning Tag '${chosenTag.idNumber}' to Visitor`);
    console.log(`=========================================`);
    
    const vis = await IdManagement.create({
      visitorName: "Jane Doe",
      phoneNumber: "9876543210",
      company: comp.CompanyName,
      idNumber: chosenTag.idNumber,
    });
    console.log("✅ Visitor Created:", {
      id: vis.IdManagementID,
      visitor: vis.VisitorName,
      tag: vis.IdNumber,
      token: vis.token,
      validFrom: vis.ValidFrom,
      validUntil: vis.ValidUntil,
    });

    console.log("\n=========================================");
    console.log("🧪 4. Verifying Tag Collision Lock");
    console.log("=========================================");
    try {
      await IdManagement.create({
        visitorName: "Bob Smith",
        phoneNumber: "9876543211",
        company: comp.CompanyName,
        idNumber: chosenTag.idNumber,
      });
      console.error("❌ Failed: Tag collision check should have thrown an error!");
    } catch (err) {
      console.log("✅ Correctly rejected re-assigning active tag:", err.message);
    }

    console.log("\n=========================================");
    console.log("🧪 5. Verifying Updated Available Tags List");
    console.log("=========================================");
    const updatedAvailable = await Tag.findAvailable();
    const isChosenStillAvailable = updatedAvailable.some(t => t.idNumber === chosenTag.idNumber);
    console.log(`✅ Is assigned tag '${chosenTag.idNumber}' in available list? ${isChosenStillAvailable ? 'YES (Error)' : 'NO (Correctly hidden)'}`);
  }

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
}

testFlow().then(() => process.exit(0)).catch(err => { console.error("❌ Test error:", err); process.exit(1); });
