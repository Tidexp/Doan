import "dotenv/config";
import postgres from "postgres";

async function migrate() {
  console.log("🔄 Migrating embedding column from 768 to 3072 dimensions...");
  console.log("⚠️  WARNING: This will delete all existing embeddings!");

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error("❌ POSTGRES_URL not found in environment");
    process.exit(1);
  }

  // Use direct connection (not pooler) for DDL operations
  const directUrl = connectionString.replace('-pooler.', '.');

  const sql = postgres(directUrl, {
    ssl: "require",
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30,
  });

  try {
    // Drop old column
    await sql`ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding`;
    console.log("✓ Dropped old embedding column");

    // Add new column with 3072 dimensions
    await sql`ALTER TABLE document_chunks ADD COLUMN embedding vector(3072)`;
    console.log("✓ Added new embedding column (3072 dimensions)");

    console.log("✅ Migration complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
