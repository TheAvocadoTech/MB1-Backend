require('dotenv').config();
const { connectDB } = require('../config/db');
const Tag = require('../models/Tag.model');
const IdManagement = require('../models/IDManagement.model');
const Company = require('../models/Company.model');

async function testTimezoneFix() {
  const pool = await connectDB();
  
  // Create a test company
  const comp = await Company.create({ companyName: "Timezone Test Corp" });

  // Create a tag
  const tag = await Tag.create({ idNumber: "TZ_TAG_1", nickname: "Timezone Test Tag" });
  console.log("Created Tag:", tag.idNumber);

  // Check initial availability
  const initialAvailable = await Tag.findAvailable();
  console.log("Initial Available Tags count:", initialAvailable.length);

  // Create visitor assigned to TZ_TAG_1
  const vis = await IdManagement.create({
    visitorName: "Timezone Visitor",
    phoneNumber: "9876543210",
    company: comp.CompanyName,
    idNumber: "TZ_TAG_1",
  });

  console.log("Visitor Created with ValidUntil:", vis.ValidUntil);

  // Check tags status after visitor creation
  const allTagsAfter = await Tag.findAll();
  console.log("All Tags After Visitor Creation:");
  allTagsAfter.forEach(t => {
    console.log(`  - ${t.nickname} (${t.idNumber}): Status = [${t.status}], Available = ${t.isAvailable}, AssignedTo = ${t.assignedVisitorName}`);
  });

  // Clean up test data
  await pool.request().query("DELETE FROM IdManagement WHERE IdNumber = 'TZ_TAG_1'");
  await pool.request().query("DELETE FROM IdTags WHERE IdNumber = 'TZ_TAG_1'");
  await pool.request().query("DELETE FROM Companies WHERE CompanyName = 'Timezone Test Corp'");
}

testTimezoneFix().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
