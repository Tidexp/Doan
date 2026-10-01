import "dotenv/config";
import neo4j from "neo4j-driver";

async function extractAllRelations() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    console.log("🔍 Extracting all relationships from Neo4j...\n");

    // Get all relationship types
    const typesResult = await session.run(`
      MATCH ()-[r]->()
      RETURN DISTINCT type(r) as relType, count(r) as count
      ORDER BY count DESC
    `);

    console.log("📊 Relationship Types Summary:");
    console.log("=====================================");
    typesResult.records.forEach((record) => {
      console.log(`${record.get("relType")}: ${record.get("count")} relationships`);
    });

    // Get all relationships with details
    console.log("\n📋 All Relationships:");
    console.log("=====================================\n");

    const allRelsResult = await session.run(`
      MATCH (a:Entity)-[r]->(b:Entity)
      RETURN
        a.label as fromLabel,
        a.canonicalLabel as fromCanonical,
        type(r) as relType,
        b.label as toLabel,
        b.canonicalLabel as toCanonical,
        properties(r) as props,
        a.sourceId as sourceId,
        a.chunkId as chunkId
      LIMIT 500
    `);

    console.log(`Found ${allRelsResult.records.length} relationships (limited to 500)\n`);

    // Group by relationship type
    const byType: Record<string, any[]> = {};

    allRelsResult.records.forEach((record) => {
      const relType = record.get("relType");
      const rel = {
        from: record.get("fromLabel"),
        to: record.get("toLabel"),
        properties: record.get("props"),
        sourceId: record.get("sourceId"),
        chunkId: record.get("chunkId"),
      };

      if (!byType[relType]) {
        byType[relType] = [];
      }
      byType[relType].push(rel);
    });

    // Display grouped relationships
    for (const [relType, rels] of Object.entries(byType)) {
      console.log(`\n🔗 ${relType} (${rels.length} relationships)`);
      console.log("─".repeat(50));

      rels.slice(0, 10).forEach((rel, i) => {
        console.log(`${i + 1}. "${rel.from}" → "${rel.to}"`);
        if (rel.properties.predicate) {
          console.log(`   Predicate: ${rel.properties.predicate}`);
        }
        if (rel.properties.reason) {
          console.log(`   Reason: ${rel.properties.reason}`);
        }
        console.log(`   Source: ${rel.sourceId} / Chunk: ${rel.chunkId}\n`);
      });

      if (rels.length > 10) {
        console.log(`   ... and ${rels.length - 10} more\n`);
      }
    }

    // Get conflicts specifically
    console.log("\n⚠️  Conflicts:");
    console.log("=====================================");
    const conflictsResult = await session.run(`
      MATCH (a:Entity)-[r:CONFLICTS_WITH]->(b:Entity)
      RETURN
        a.label as left,
        b.label as right,
        r.reason as reason,
        a.sourceId as sourceId
      LIMIT 50
    `);

    if (conflictsResult.records.length === 0) {
      console.log("No conflicts found.");
    } else {
      conflictsResult.records.forEach((record, i) => {
        console.log(`\n${i + 1}. Conflict:`);
        console.log(`   Left: "${record.get("left")}"`);
        console.log(`   Right: "${record.get("right")}"`);
        console.log(`   Reason: ${record.get("reason")}`);
        console.log(`   Source: ${record.get("sourceId")}`);
      });
    }

    console.log("\n✅ Extraction complete!");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

extractAllRelations();
