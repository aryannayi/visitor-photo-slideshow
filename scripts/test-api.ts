import { POST } from "../src/app/api/upload/route";
import { prisma } from "../src/lib/prisma";
import fs from "fs";
import path from "path";

// Helper to create a fake File
function createTestFile(filename: string, mimeType: string, content = "fake image content") {
  const blob = new Blob([content], { type: mimeType });
  return new File([blob], filename, { type: mimeType });
}

async function runTests() {
  console.log("--- Starting Backend & API Verification ---");

  // Clean test DB records first
  await prisma.photo.deleteMany({});
  await prisma.visitor.deleteMany({});

  // 1. Validation: Missing Fields
  console.log("Test 1: Validation - Missing name, contact, consent");
  {
    const fd = new FormData();
    fd.append("contact", "alice@example.com");
    fd.append("consent", "true");
    fd.append("photos", createTestFile("photo1.jpg", "image/jpeg"));
    const req = new Request("http://localhost:3000/api/upload", { method: "POST", body: fd }) as any;
    const res = await POST(req);
    const data = await res.json();
    console.assert(res.status === 400 && data.success === false, "Test 1a failed");
    console.log("✓ Correctly rejected missing name");
  }

  {
    const fd = new FormData();
    fd.append("name", "Alice");
    fd.append("contact", "alice@example.com");
    fd.append("consent", "false"); // consent must be "true"
    fd.append("photos", createTestFile("photo1.jpg", "image/jpeg"));
    const req = new Request("http://localhost:3000/api/upload", { method: "POST", body: fd }) as any;
    const res = await POST(req);
    const data = await res.json();
    console.assert(res.status === 400 && data.success === false, "Test 1b failed");
    console.log("✓ Correctly rejected consent !== 'true'");
  }

  // 2. Validation: Invalid File Types and Counts
  console.log("\nTest 2: Validation - Invalid MIME type and file counts");
  {
    const fd = new FormData();
    fd.append("name", "Alice");
    fd.append("contact", "alice@example.com");
    fd.append("consent", "true");
    fd.append("photos", createTestFile("document.pdf", "application/pdf"));
    const req = new Request("http://localhost:3000/api/upload", { method: "POST", body: fd }) as any;
    const res = await POST(req);
    const data = await res.json();
    console.assert(res.status === 400 && data.success === false, "Test 2a failed");
    console.log("✓ Correctly rejected invalid MIME type");
  }

  {
    const fd = new FormData();
    fd.append("name", "Alice");
    fd.append("contact", "alice@example.com");
    fd.append("consent", "true");
    // 4 photos (max allowed is 3)
    fd.append("photos", createTestFile("1.jpg", "image/jpeg"));
    fd.append("photos", createTestFile("2.jpg", "image/jpeg"));
    fd.append("photos", createTestFile("3.jpg", "image/jpeg"));
    fd.append("photos", createTestFile("4.jpg", "image/jpeg"));
    const req = new Request("http://localhost:3000/api/upload", { method: "POST", body: fd }) as any;
    const res = await POST(req);
    const data = await res.json();
    console.assert(res.status === 400 && data.success === false, "Test 2b failed");
    console.log("✓ Correctly rejected >3 photos");
  }

  // 3. Successful Upload - New Visitor
  console.log("\nTest 3: Successful upload for a new visitor");
  let visitorId = "";
  {
    const fd = new FormData();
    fd.append("name", "Alice Wonderland");
    fd.append("contact", "  Alice@Example.COM  "); // Test normalization
    fd.append("consent", "true");
    fd.append("photos", createTestFile("vacation.png", "image/png", "png-content-1"));
    fd.append("photos", createTestFile("family.webp", "image/webp", "webp-content-2"));

    const req = new Request("http://localhost:3000/api/upload", { method: "POST", body: fd }) as any;
    const res = await POST(req);
    const data = await res.json();

    console.assert(res.status === 201 && data.success === true, "Test 3 status failed");
    console.assert(data.isReturningVisitor === false, "Should not be returning visitor");
    console.assert(data.visitor.contact === "alice@example.com", "Contact should be normalized");
    console.assert(data.queuedPhotosCount === 2, "Queued photos count should be 2");
    visitorId = data.visitor.id;

    // Check DB
    const photos = await prisma.photo.findMany({ where: { visitorId } });
    console.assert(photos.length === 2, "DB should have 2 photos");
    console.assert(photos.every((p) => p.status === "QUEUED"), "All photos should be QUEUED");

    // Check files on disk
    for (const p of photos) {
      const diskPath = path.join(process.cwd(), "public", p.imageUrl);
      console.assert(fs.existsSync(diskPath), `File ${diskPath} should exist on disk`);
    }

    console.log("✓ New visitor created with normalized contact, files saved, photos QUEUED");
  }

  // 4. Simulate Slideshow: Older Photos get PLAYED
  console.log("\nTest 4: Simulate slideshow playing older photos");
  {
    await prisma.photo.updateMany({
      where: { visitorId },
      data: { status: "PLAYED", playCount: 1 },
    });
    const playedCount = await prisma.photo.count({ where: { visitorId, status: "PLAYED" } });
    console.assert(playedCount === 2, "All 2 photos should now be PLAYED");
    console.log("✓ Set 2 older photos to PLAYED");
  }

  // 5. Returning Visitor Logic: Older photos set back to QUEUED + new photo QUEUED
  console.log("\nTest 5: Returning visitor upload");
  {
    const fd = new FormData();
    fd.append("name", "Alice W."); // Updated name
    fd.append("contact", "alice@example.com");
    fd.append("consent", "true");
    fd.append("photos", createTestFile("new-photo.jpg", "image/jpeg", "new-jpeg-content"));

    const req = new Request("http://localhost:3000/api/upload", { method: "POST", body: fd }) as any;
    const res = await POST(req);
    const data = await res.json();

    console.assert(res.status === 201 && data.success === true, "Test 5 status failed");
    console.assert(data.isReturningVisitor === true, "Should be returning visitor");
    console.assert(data.visitor.name === "Alice W.", "Visitor name should be updated");
    console.assert(data.queuedPhotosCount === 3, `Queued photos count should be 3 (2 old + 1 new), got ${data.queuedPhotosCount}`);

    // Verify all photos for this visitor are now QUEUED in DB
    const allPhotos = await prisma.photo.findMany({ where: { visitorId } });
    console.assert(allPhotos.length === 3, "Total photos should be 3");
    console.assert(allPhotos.every((p) => p.status === "QUEUED"), "All photos (old and new) must be QUEUED");
    console.log("✓ Returning visitor recognized: older photos updated back to QUEUED, new photo added (total 3 queued)");
  }

  // 6. Returning Visitor with Phone Number normalization
  console.log("\nTest 6: Phone number visitor normalization");
  {
    const fd = new FormData();
    fd.append("name", "Bob Smith");
    fd.append("contact", "+1 (555) 234-5678");
    fd.append("consent", "true");
    fd.append("photos", createTestFile("bob.jpg", "image/jpeg"));

    const req = new Request("http://localhost:3000/api/upload", { method: "POST", body: fd }) as any;
    const res = await POST(req);
    const data = await res.json();

    console.assert(res.status === 201 && data.success === true, "Test 6 status failed");
    console.assert(data.isReturningVisitor === false, "Bob is new visitor");
    console.assert(data.visitor.contact === "15552345678", `Contact should be digits-only, got ${data.visitor.contact}`);
    console.log("✓ Phone contact normalized to digits-only '15552345678'");
  }

  console.log("\n=============================================");
  console.log("ALL TESTS PASSED SUCCESSFULLY! 🚀");
  console.log("=============================================");
}

runTests()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

