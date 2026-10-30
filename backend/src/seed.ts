import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { closeMongo, connectMongo } from "./lib/mongo.js";
import { db } from "./lib/store.js";
import { chunkPages, extractPdf } from "./services/pdf.js";

async function makePdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage();
  let y = page.getHeight() - 50;
  for (const line of lines) {
    if (y < 60) {
      page = doc.addPage();
      y = page.getHeight() - 50;
    }
    const isHeading = line.startsWith("# ");
    const text = isHeading ? line.slice(2) : line;
    page.drawText(text.slice(0, 110), {
      x: 50,
      y,
      size: isHeading ? 16 : 11,
      font: isHeading ? fontBold : font,
    });
    y -= isHeading ? 22 : 16;
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

const orgA = {
  name: "Northridge University",
  email: "admin@northridge.test",
  password: "password123",
  files: [
    {
      filename: "Scholarship_Rules.pdf",
      lines: [
        "# Northridge University Scholarship Rules",
        "Document owner: Student Finance Office",
        "# Merit Scholarship",
        "The Merit Scholarship is available to undergraduate students in year 2 or later.",
        "First-year students are not eligible for the Merit Scholarship.",
        "Applicants must have a minimum GPA of 3.5.",
        "The Merit Scholarship cannot be combined with a sports scholarship.",
        "Students who already hold a sports scholarship may not hold both awards.",
        "Award amount is 40 percent of tuition for one academic year.",
        "Applications close on 15 March each year.",
        "# Need-Based Aid",
        "Need-based aid requires a completed financial statement and a GPA of at least 2.5.",
        "Need-based aid may be combined with a sports scholarship.",
        "The Student Finance Office is in Building C, Room 210.",
        "Office hours are Monday to Friday, 9:00 to 16:00.",
      ],
    },
    {
      filename: "Admissions_Handbook.pdf",
      lines: [
        "# Northridge Admissions Handbook",
        "Undergraduate applications open on 1 November.",
        "Required documents: transcript, ID copy, and personal statement.",
        "Computer Science applicants must complete a short math diagnostic.",
        "Orientation week starts the Monday before classes.",
        "Late applications are not accepted after 30 June.",
      ],
    },
    {
      filename: "Campus_Services.pdf",
      lines: [
        "# Northridge Campus Services",
        "The library is open 08:00 to 22:00 on weekdays.",
        "Student counselling is available by appointment in Building A.",
        "The IT helpdesk email is helpdesk@northridge.test.",
      ],
    },
  ],
};

const orgB = {
  name: "Harbor Technical College",
  email: "admin@harbor.test",
  password: "password123",
  files: [
    {
      filename: "Housing_Policy.pdf",
      lines: [
        "# Harbor Technical College Housing Policy",
        "On-campus housing is guaranteed for first-year students only.",
        "Returning students may apply for housing but are waitlisted.",
        "Quiet hours are 22:00 to 07:00.",
        "Pets are not allowed except registered assistance animals.",
        "Housing applications open on 1 April.",
      ],
    },
    {
      filename: "Leave_of_Absence.pdf",
      lines: [
        "# Academic Leave of Absence",
        "Students may request a leave of absence for up to two consecutive semesters.",
        "A leave request must be submitted at least 14 days before the term starts.",
        "Students on leave cannot use campus housing.",
        "To return, students file a return-to-study form with the registrar.",
      ],
    },
    {
      filename: "IT_Acceptable_Use.pdf",
      lines: [
        "# IT Acceptable Use Policy",
        "College accounts must not be shared.",
        "Lab computers log out after 15 minutes of inactivity.",
        "Personal routers are not permitted in residences.",
      ],
    },
  ],
};

async function seedOrg(org: typeof orgA) {
  const passwordHash = await bcrypt.hash(org.password, 10);
  const existing = await db.findOrgByEmail(org.email);
  const organization = await db.upsertOrg({
    ...(existing?.id ? { id: existing.id } : {}),
    name: org.name,
    email: org.email,
    passwordHash,
    assistantToken: existing?.assistantToken || randomUUID(),
  });
  await db.deleteDocumentsForOrg(organization.id);

  for (const file of org.files) {
    const buffer = await makePdf(file.lines);
    const extracted = await extractPdf(buffer);
    const chunks = chunkPages(extracted.pages);
    await db.createDocument({
      organizationId: organization.id,
      filename: file.filename,
      pageCount: extracted.pageCount,
      sizeBytes: buffer.length,
      chunks: chunks.map((c) => ({ pageNumber: c.pageNumber, content: c.text })),
    });
  }
  return organization;
}

async function main() {
  await connectMongo();
  const a = await seedOrg(orgA);
  const b = await seedOrg(orgB);
  console.log("Seeded organizations:");
  console.log(`  ${a.name}  ${a.email} / password123  token=${a.assistantToken}`);
  console.log(`  ${b.name}  ${b.email} / password123  token=${b.assistantToken}`);
}

main()
  .then(() => closeMongo())
  .catch(async (err) => {
    console.error(err);
    await closeMongo();
    process.exit(1);
  });
