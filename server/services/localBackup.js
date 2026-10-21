import { createHash, randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import mongoose from "mongoose";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const EJSON = mongoose.mongo.BSON.EJSON;
const BACKUP_DIRECTORY = process.env.NODE_ENV === "test"
  ? resolve(tmpdir(), "academy-management-backup-tests")
  : fileURLToPath(new URL("../../local-backups/", import.meta.url));
const FORMAT = "academy-local-backup";
const VERSION = 1;
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
export const MAX_EXPANDED_BACKUP_BYTES = 64 * 1024 * 1024;

function safeDatabaseName(name) {
  return String(name || "academy").replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function backupFileName(databaseName, createdAt = new Date().toISOString()) {
  return `${safeDatabaseName(databaseName)}-${createdAt.replace(/[:.]/g, "-")}.academy-backup`;
}

async function visibleCollections(db) {
  const items = await db.listCollections({}, { nameOnly: true }).toArray();
  return items.map(({ name }) => name)
    .filter((name) => !name.startsWith("system.") && name !== "authsessions");
}

export async function captureDatabase() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database is not connected");
  const names = (await visibleCollections(db)).sort();
  const collections = {};
  for (const name of names) collections[name] = await db.collection(name).find({}).toArray();
  return { format: FORMAT, version: VERSION, database: db.databaseName, createdAt: new Date().toISOString(), collections };
}

export async function encodeBackup(payload) {
  const raw = Buffer.from(EJSON.stringify(payload, { relaxed: false }), "utf8");
  if (raw.length > MAX_EXPANDED_BACKUP_BYTES) {
    throw Object.assign(new Error("Database exceeds the 64 MiB expanded backup limit; use a database-native backup tool"), { status: 413 });
  }
  const buffer = await gzipAsync(raw, { level: 9 });
  if (buffer.length > MAX_BACKUP_BYTES) {
    throw Object.assign(new Error("Backup exceeds the 32 MiB upload limit; use a database-native backup tool"), { status: 413 });
  }
  return buffer;
}

export async function decodeBackup(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BACKUP_BYTES) {
    throw Object.assign(new Error("Backup must be a binary file of at most 32 MiB"), { status: 400 });
  }
  let payload;
  try {
    payload = EJSON.parse((await gunzipAsync(buffer, { maxOutputLength: MAX_EXPANDED_BACKUP_BYTES })).toString("utf8"));
  } catch {
    throw Object.assign(new Error("This is not a valid Academy Management backup file"), { status: 400 });
  }
  if (payload?.format !== FORMAT || payload?.version !== VERSION || !payload.collections || typeof payload.collections !== "object" || Array.isArray(payload.collections) || !Object.keys(payload.collections).length) {
    throw Object.assign(new Error("This backup format is not supported"), { status: 400 });
  }
  for (const [name, documents] of Object.entries(payload.collections)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name) || ["__proto__", "prototype", "constructor"].includes(name) || name.startsWith("system.") || !Array.isArray(documents) || documents.some(doc => !doc || typeof doc !== "object" || Array.isArray(doc))) {
      throw Object.assign(new Error("The backup contains an invalid collection"), { status: 400 });
    }
  }
  return payload;
}

export async function saveBackup(buffer, databaseName, createdAt) {
  await mkdir(BACKUP_DIRECTORY, { recursive: true });
  const fileName = backupFileName(databaseName, createdAt);
  const path = resolve(BACKUP_DIRECTORY, fileName);
  await writeFile(path, buffer, { flag: "wx" });
  return { fileName, path, sha256: createHash("sha256").update(buffer).digest("hex") };
}

async function replaceDatabase(payload) {
  const db = mongoose.connection.db;
  const currentNames = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map(({ name }) => name).filter((name) => !name.startsWith("system."));
  const allNames = new Set([...currentNames, ...Object.keys(payload.collections)]);
  for (const name of allNames) {
    const collection = db.collection(name);
    await collection.deleteMany({});
    const documents = name === "authsessions" ? [] : payload.collections[name] || [];
    if (documents.length) await collection.insertMany(documents, { ordered: true });
  }
}

export async function restoreDatabase(buffer) {
  const incoming = await decodeBackup(buffer);
  const safetyPayload = await captureDatabase();
  const safetyBuffer = await encodeBackup(safetyPayload);
  const safety = await saveBackup(safetyBuffer, safetyPayload.database, `${safetyPayload.createdAt.slice(0, -1)}-before-restoreZ`);
  try {
    await replaceDatabase(incoming);
    // A restore must not resurrect old JWTs or outstanding password-reset codes.
    await mongoose.connection.db.collection("users").updateMany({}, { $set: {
      tokenVersion: randomInt(1, 2 ** 48 - 1),
      passwordResetTokenHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0,
    } });
  } catch (error) {
    await replaceDatabase(safetyPayload);
    throw Object.assign(new Error(`Restore failed and the previous data was put back. ${error.message}`), { status: 500 });
  }
  return { incoming, safety };
}

export { BACKUP_DIRECTORY, FORMAT, VERSION };
