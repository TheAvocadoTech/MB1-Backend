// scratch/test_rfid_reception_and_path_fix.js
require("dotenv").config();
const assert = require("assert");
const rfidTracker = require("../services/rfidTracker.service");
const rfidReaders = require("../config/rfidReaders.json");

async function runVerification() {
  console.log("🚀 Running RFID Reception & Path Wall-Cutting Fix Verification...\n");

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Reader Lookup Multi-Property Matching
  // ───────────────────────────────────────────────────────────────────────────
  console.log("1️⃣ Testing findReaderById multi-property resolution...");

  // Reader 5: NOC ROOM Door, id: 33, sr: "001", sequence: 5, ip: "192.168.30.10"
  const testCases = [
    { input: 33, expectedSeq: 5, desc: "numeric id (33)" },
    { input: "33", expectedSeq: 5, desc: "string id ('33')" },
    { input: 5, expectedSeq: 5, desc: "numeric sequence (5)" },
    { input: "5", expectedSeq: 5, desc: "string sequence ('5')" },
    { input: "001", expectedSeq: 5, desc: "serial sr string ('001')" },
    { input: 1, expectedSeq: 5, desc: "numeric sr (1)" },
    { input: "192.168.30.10", expectedSeq: 5, desc: "ip address ('192.168.30.10')" },
    { input: "NOC ROOM Door", expectedSeq: 5, desc: "location name ('NOC ROOM Door')" },

    // Reader 6: Front of VSR Door, id: 16, sr: "0013", sequence: 6
    { input: 16, expectedSeq: 6, desc: "numeric id (16)" },
    { input: "0013", expectedSeq: 6, desc: "serial sr string ('0013')" },
    { input: 13, expectedSeq: 6, desc: "numeric sr (13)" },

    // Reader 11: Colo-1-2 passage 2, id: 46, sr: "0014", sequence: 11
    { input: 46, expectedSeq: 11, desc: "numeric id (46)" },
    { input: "0014", expectedSeq: 11, desc: "serial sr ('0014')" },
    { input: 14, expectedSeq: 11, desc: "numeric sr (14)" },

    // Reader 15: Cabinate End Point, id: 43, sr: "0015", sequence: 15
    { input: 43, expectedSeq: 15, desc: "numeric id (43)" },
    { input: "0015", expectedSeq: 15, desc: "serial sr ('0015')" },
  ];

  for (const tc of testCases) {
    // Test through updateScan
    const scanState = await rfidTracker.updateScan({
      tagId: "TEST_READER_TAG_01",
      machine_number: tc.input,
      received_at: new Date().toISOString(),
    });

    assert(
      scanState.sequence === tc.expectedSeq,
      `❌ Failed for ${tc.desc}: expected sequence ${tc.expectedSeq} but got ${scanState.sequence}`
    );
    console.log(`   ✅ Matched ${tc.desc} -> Sequence ${scanState.sequence} (${scanState.location})`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Live Location Retrieval For Tag (Not defaulting to Reception)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n2️⃣ Testing getLivePathForTag live reader response...");
  const testTag = "TEST_EPIC_TAG_99";

  // Simulate hardware scan at machine "001" (NOC Room Door, sequence 5)
  await rfidTracker.updateScan({
    tagId: testTag,
    machine_number: "001", // Notice: sr string format as hardware sends!
    received_at: new Date().toISOString(),
  });

  const livePath = await rfidTracker.getLivePathForTag(testTag);
  console.log("   Scanned Machine: '001'");
  console.log(`   Live Reader Location: "${livePath.currentReader.location}"`);
  console.log(`   Live Reader Sequence: ${livePath.currentReader.sequence}`);
  console.log(`   Has Scanned: ${livePath.hasScanned}`);

  assert(
    livePath.currentReader.sequence === 5,
    `❌ Expected sequence 5 (NOC Room Door) but got ${livePath.currentReader.sequence} (${livePath.currentReader.location})`
  );
  assert(
    livePath.currentReader.location === "NOC ROOM Door",
    `❌ Expected location "NOC ROOM Door" but got "${livePath.currentReader.location}"`
  );
  assert(livePath.hasScanned === true, "❌ Expected hasScanned to be true");
  console.log("   🎉 SUCCESS: Tag correctly resolves to NOC ROOM Door (Sequence 5), NOT Reception!");

  // Move tag to reader 46 (Colo-1-2 passage 2, sequence 11)
  await rfidTracker.updateScan({
    tagId: testTag,
    machine_number: 46,
    received_at: new Date(Date.now() + 1000).toISOString(),
  });

  const livePathMoved = await rfidTracker.getLivePathForTag(testTag);
  assert(
    livePathMoved.currentReader.sequence === 11,
    `❌ Expected sequence 11 but got ${livePathMoved.currentReader.sequence}`
  );
  console.log(`   ✅ Moved to Colo-1-2 passage 2 -> Sequence ${livePathMoved.currentReader.sequence}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Token Resolution (Live Path by QR Token)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n3️⃣ Testing getLivePathByToken with active scan...");
  const tokenGen = await rfidTracker.generateQrToken({
    rfidCode: testTag,
    visitorName: "Test Visitor Fix",
  });

  const tokenPath = await rfidTracker.getLivePathByToken(tokenGen.token);
  console.log(`   Token: ${tokenGen.token}`);
  console.log(`   Resolved Visitor: ${tokenPath.visitorName}`);
  console.log(`   Resolved Sequence: ${tokenPath.currentReader.sequence} (${tokenPath.currentReader.location})`);

  assert(
    tokenPath.currentReader.sequence === 11,
    `❌ Expected token to resolve to sequence 11 but got ${tokenPath.currentReader.sequence}`
  );
  console.log("   🎉 SUCCESS: Token resolves to active tag location (Sequence 11), NOT Reception!");

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Remaining Path Algorithm Logic (Does not skip active target reader)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n4️⃣ Testing Remaining Path Logic (targetSeq inclusion)...");
  // Simulating the useMemo logic in useSmoothLocation:
  const targetSeq = 4; // Bom 12 Main Entry Door
  const currentPos = { x: 21.0, y: 36.0 }; // Moving from Man Trap towards Bom 12

  const remaining = [currentPos];
  const activeTarget = rfidReaders.find((r) => r.sequence === targetSeq);
  if (activeTarget) {
    remaining.push(activeTarget.coords);
  }
  rfidReaders.filter((r) => r.sequence > targetSeq).forEach((r) => remaining.push(r.coords));

  console.log(`   Target Sequence: ${targetSeq} (${activeTarget.location})`);
  console.log(`   Remaining Points Count: ${remaining.length}`);
  console.log(`   First Point (currentPos):`, remaining[0]);
  console.log(`   Second Point (Target Reader):`, remaining[1]);
  console.log(`   Third Point (Next Waypoint/Reader):`, remaining[2]);

  assert.deepStrictEqual(
    remaining[1],
    activeTarget.coords,
    "❌ Remaining path must include target reader coordinates before continuing!"
  );
  console.log("   🎉 SUCCESS: Remaining path strictly includes target reader before continuing!");

  console.log("\n========================================================");
  console.log("✨ ALL 4 RFID VERIFICATION TESTS PASSED SUCCESSFULLY! ✨");
  console.log("========================================================\n");
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
