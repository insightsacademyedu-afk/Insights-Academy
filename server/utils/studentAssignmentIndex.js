export async function ensureStudentAssignmentIndex(collection) {
  let indexes;
  try { indexes = await collection.indexes(); } catch (error) { if (error.code !== 26) throw error; indexes = []; }
  // Build the replacement before removing the legacy constraint.
  await collection.createIndex({ student: 1, academicSession: 1 }, {
    unique: true, partialFilterExpression: { status: "active", archivedAt: null }, name: "active_student_session_unique",
  });
  const legacy = indexes.find(index => index.name === "student_1_academicSession_1" && index.unique && !index.partialFilterExpression);
  if (legacy) await collection.dropIndex(legacy.name);
}
