import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { HttpError } from "./http.js";
import { cols, mongoClient } from "./mongo.js";
import { LIMITS } from "../services/pdf.js";

export type UsageCounts = {
  asked: number;
  answered: number;
  unable: number;
  review: number;
};

export type Organization = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  assistantToken: string;
  createdAt: string;
  tokenVersion?: number;
  documentCount?: number;
  usage?: UsageCounts;
  askDay?: string;
  askCount?: number;
};

export type DocumentRow = {
  id: string;
  organizationId: string;
  filename: string;
  pageCount: number;
  sizeBytes: number;
  chunkCount: number;
  createdAt: string;
};

export type ChunkRow = {
  id: string;
  organizationId: string;
  documentId: string;
  pageNumber: number;
  content: string;
};

const EMPTY_USAGE: UsageCounts = { asked: 0, answered: 0, unable: 0, review: 0 };

function now() {
  return new Date().toISOString();
}

function id() {
  return randomUUID();
}

function sessionOpts(session: ClientSession | null) {
  return session ? { session } : {};
}

function isTxnUnsupported(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /replica set|Transaction numbers are only allowed/i.test(message);
}

function emptyUsage(): UsageCounts {
  return { ...EMPTY_USAGE };
}

async function commitDocument(
  input: {
    documentId: string;
    createdAt: string;
    organizationId: string;
    filename: string;
    pageCount: number;
    sizeBytes: number;
    chunks: { id: string; pageNumber: number; content: string }[];
  },
  session: ClientSession | null
): Promise<{ document: DocumentRow | null; full: boolean }> {
  const opts = sessionOpts(session);
  const orgs = cols().organizations;
  const org = await orgs.findOne({ id: input.organizationId }, opts);
  if (!org) throw new HttpError(404, "Organization not found.");

  let documentCount = org.documentCount;
  if (typeof documentCount !== "number") {
    documentCount = await cols().documents.countDocuments({ organizationId: input.organizationId }, opts);
    await orgs.updateOne({ id: org.id }, { $set: { documentCount } }, opts);
  }
  if (documentCount >= LIMITS.maxDocuments) {
    return { document: null, full: true };
  }

  const document: DocumentRow = {
    id: input.documentId,
    organizationId: input.organizationId,
    filename: input.filename,
    pageCount: input.pageCount,
    sizeBytes: input.sizeBytes,
    chunkCount: input.chunks.length,
    createdAt: input.createdAt,
  };
  await cols().documents.insertOne(document, opts);
  if (input.chunks.length) {
    await cols().chunks.insertMany(
      input.chunks.map((chunk) => ({
        id: chunk.id,
        organizationId: input.organizationId,
        documentId: document.id,
        pageNumber: chunk.pageNumber,
        content: chunk.content,
      })),
      opts
    );
  }
  await orgs.updateOne({ id: org.id }, { $inc: { documentCount: 1 } }, opts);
  return { document, full: false };
}

export const db = {
  findOrgByEmail: (email: string) => cols().organizations.findOne({ email }),
  findOrgById: (id: string) => cols().organizations.findOne({ id }),
  findOrgByToken: (assistantToken: string) => cols().organizations.findOne({ assistantToken }),

  async upsertOrg(input: Omit<Organization, "id" | "createdAt"> & { id?: string }) {
    const orgs = cols().organizations;
    const existing = input.id
      ? await orgs.findOne({ id: input.id })
      : await orgs.findOne({ email: input.email });

    if (existing) {
      const next = { ...existing, ...input, id: existing.id };
      await orgs.updateOne({ id: existing.id }, { $set: input });
      return next;
    }

    const org: Organization = {
      id: id(),
      createdAt: now(),
      tokenVersion: 0,
      documentCount: 0,
      usage: emptyUsage(),
      ...input,
    };
    await orgs.insertOne(org);
    return org;
  },

  async updateOrgToken(orgId: string, assistantToken: string) {
    await cols().organizations.updateOne({ id: orgId }, { $set: { assistantToken } });
    return cols().organizations.findOne({ id: orgId });
  },

  async bumpTokenVersion(orgId: string) {
    await cols().organizations.updateOne({ id: orgId }, { $inc: { tokenVersion: 1 } });
  },

  countDocuments: (organizationId: string) => cols().documents.countDocuments({ organizationId }),

  findDocument: (id: string, organizationId: string) =>
    cols().documents.findOne({ id, organizationId }),

  async listDocuments(organizationId: string) {
    const documents = await cols().documents.find({ organizationId }).sort({ createdAt: -1 }).toArray();
    return documents.map((d) => ({
      id: d.id,
      filename: d.filename,
      pageCount: d.pageCount,
      sizeBytes: d.sizeBytes,
      chunkCount: d.chunkCount ?? 0,
      createdAt: d.createdAt,
    }));
  },

  async createDocument(input: {
    organizationId: string;
    filename: string;
    pageCount: number;
    sizeBytes: number;
    chunks: { pageNumber: number; content: string }[];
  }) {
    const stable = {
      ...input,
      documentId: id(),
      createdAt: now(),
      chunks: input.chunks.map((chunk) => ({ ...chunk, id: id() })),
    };
    const session = mongoClient().startSession();
    let result: { document: DocumentRow | null; full: boolean };
    try {
      try {
        result = { document: null, full: false };
        await session.withTransaction(async () => {
          result = await commitDocument(stable, session);
        });
      } catch (err) {
        if (!isTxnUnsupported(err)) throw err;
        result = await commitDocument(stable, null);
      }
    } finally {
      await session.endSession();
    }
    if (result!.full) {
      throw new HttpError(
        400,
        `Knowledge base is full. Maximum ${LIMITS.maxDocuments} PDF documents per organization.`
      );
    }
    if (!result!.document) throw new HttpError(500, "Could not save the document.");
    return result!.document;
  },

  async deleteDocument(documentId: string, organizationId: string) {
    const deleted = await cols().documents.deleteOne({ id: documentId, organizationId });
    await cols().chunks.deleteMany({ documentId, organizationId });
    if (deleted.deletedCount) {
      await cols().organizations.updateOne(
        { id: organizationId, documentCount: { $gt: 0 } },
        { $inc: { documentCount: -1 } }
      );
    }
  },

  async deleteDocumentsForOrg(organizationId: string) {
    await cols().documents.deleteMany({ organizationId });
    await cols().chunks.deleteMany({ organizationId });
    await cols().organizations.updateOne({ id: organizationId }, { $set: { documentCount: 0 } });
  },

  async chunksForOrg(organizationId: string) {
    const [chunks, documents] = await Promise.all([
      cols().chunks.find({ organizationId }).toArray(),
      cols().documents.find({ organizationId }).toArray(),
    ]);
    const names = new Map(documents.map((d) => [d.id, d.filename]));
    return chunks.flatMap((c) => {
      const filename = names.get(c.documentId);
      if (!filename) return [];
      return [{ ...c, filename }];
    });
  },

  async addUsage(organizationId: string, status: "answered" | "unable" | "review") {
    await cols().usage.insertOne({ organizationId, status, createdAt: now() });
    const org = await cols().organizations.findOne({ id: organizationId });
    if (!org?.usage) {
      await this.usageCounts(organizationId);
      return;
    }
    await cols().organizations.updateOne(
      { id: organizationId },
      { $inc: { "usage.asked": 1, [`usage.${status}`]: 1 } }
    );
  },

  async usageCounts(organizationId: string) {
    const orgs = cols().organizations;
    const org = await orgs.findOne({ id: organizationId });
    let usage = org?.usage;
    if (!usage) {
      const usageCol = cols().usage;
      const [answered, unable, review, asked] = await Promise.all([
        usageCol.countDocuments({ organizationId, status: "answered" }),
        usageCol.countDocuments({ organizationId, status: "unable" }),
        usageCol.countDocuments({ organizationId, status: "review" }),
        usageCol.countDocuments({ organizationId }),
      ]);
      usage = { asked, answered, unable, review };
      await orgs.updateOne({ id: organizationId, usage: { $exists: false } }, { $set: { usage } });
    }
    const documents = await cols().documents.countDocuments({ organizationId });
    return { ...usage, documents };
  },

  async consumeDailyAsk(organizationId: string, limit: number) {
    const day = new Date().toISOString().slice(0, 10);
    const orgs = cols().organizations;
    const reset = await orgs.updateOne(
      { id: organizationId, askDay: { $ne: day } },
      { $set: { askDay: day, askCount: 1 } }
    );
    if (reset.modifiedCount === 1) return;
    const inc = await orgs.updateOne(
      { id: organizationId, askDay: day, askCount: { $lt: limit } },
      { $inc: { askCount: 1 } }
    );
    if (inc.modifiedCount !== 1) {
      throw new HttpError(429, "Daily question limit reached for this assistant. Try again tomorrow.");
    }
  },

  async allOrgsWithDocs() {
    const orgs = await cols().organizations.find().toArray();
    return Promise.all(
      orgs.map(async (o) => ({
        ...o,
        documents: await cols().documents.find({ organizationId: o.id }).toArray(),
      }))
    );
  },
};
