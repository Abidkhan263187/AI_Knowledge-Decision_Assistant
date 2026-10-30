import { MongoClient, type Collection, type Db } from "mongodb";
import type { ChunkRow, DocumentRow, Organization } from "./store.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  if (db && client) return db;

  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI is missing. Add your Atlas connection string to backend/.env.");
  }

  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 20 });
  await client.connect();
  db = client.db(process.env.MONGODB_DB || "knowledge_assistant");

  await Promise.all([
    db.collection("organizations").createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { email: 1 }, unique: true },
      { key: { assistantToken: 1 }, unique: true },
    ]),
    db.collection("documents").createIndexes([
      { key: { id: 1 }, unique: true },
      { key: { organizationId: 1 } },
    ]),
    db.collection("chunks").createIndexes([
      { key: { organizationId: 1 } },
      { key: { organizationId: 1, documentId: 1 } },
      { key: { documentId: 1 } },
    ]),
    db.collection("usageEvents").createIndexes([
      { key: { organizationId: 1, status: 1 } },
      { key: { organizationId: 1 } },
    ]),
  ]);

  return db;
}

export function mongoClient(): MongoClient {
  if (!client) throw new Error("Mongo is not connected. Call connectMongo() first.");
  return client;
}

export async function pingMongo(): Promise<void> {
  if (!db) throw new Error("Mongo is not connected.");
  await db.command({ ping: 1 });
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}

export function cols() {
  if (!db) throw new Error("Mongo is not connected. Call connectMongo() first.");
  return {
    organizations: db.collection<Organization>("organizations"),
    documents: db.collection<DocumentRow>("documents"),
    chunks: db.collection<ChunkRow>("chunks"),
    usage: db.collection("usageEvents") as Collection<{
      organizationId: string;
      status: string;
      createdAt: string;
    }>,
  };
}
