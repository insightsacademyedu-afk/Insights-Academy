// Build the replacement first so existing email addresses stay unique throughout.
// MongoDB 5+ supports sparse and non-sparse unique indexes on the same key.
export async function ensureUserEmailIndex(collection) {
  await collection.createIndex({ email: 1 }, { unique: true, sparse: true, name: "email_optional_unique" });
  const indexes = await collection.indexes();
  for (const index of indexes) {
    if (index.name === "email_1" && index.unique && !index.sparse && !index.partialFilterExpression &&
        index.key.email === 1 && Object.keys(index.key).length === 1) {
      try { await collection.dropIndex(index.name); }
      catch (error) { if (error.code !== 27) throw error; }
    }
  }
}
