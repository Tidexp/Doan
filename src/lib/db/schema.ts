import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "manager",
  "employee",
  "guest",
]);

export const sourceStatusEnum = pgEnum("source_status", [
  "queued",
  "processing",
  "vector_ready",
  "graph_ready",
  "completed",
  "failed",
]);

export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("employee"),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("users_department_idx").on(table.departmentId)],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    fileUrl: text("file_url").notNull(),
    mimeType: text("mime_type").notNull(),
    uploadedBy: uuid("uploaded_by")
      .references(() => users.id, { onDelete: "set null" }),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    status: sourceStatusEnum("status").notNull().default("queued"),
    version: integer("version").notNull().default(1),
    errorMessage: text("error_message"),
    pageCount: integer("page_count"),
    chunkCount: integer("chunk_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sources_status_idx").on(table.status),
    index("sources_department_idx").on(table.departmentId),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // Gemini embedding-2 = 3072 dims. Keep this in sync with GEMINI_EMBEDDING_MODEL.
    embedding: vector("embedding", { dimensions: 3072 }),
    metadata: jsonb("metadata")
      .$type<{
        chunkIndex: number;
        heading?: string;
        tokenCount: number;
      }>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("chunks_source_idx").on(table.sourceId)],
);

export const sourcePermissions = pgTable(
  "source_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("source_perm_unique").on(table.sourceId, table.departmentId),
  ],
);

export const duplicateFlags = pgTable(
  "duplicate_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leftSourceId: uuid("left_source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    rightSourceId: uuid("right_source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    leftChunkId: uuid("left_chunk_id").references(() => documentChunks.id, {
      onDelete: "cascade",
    }),
    rightChunkId: uuid("right_chunk_id").references(() => documentChunks.id, {
      onDelete: "cascade",
    }),
    similarity: real("similarity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("dup_left_idx").on(table.leftSourceId),
    index("dup_right_idx").on(table.rightSourceId),
  ],
);

export const processingLogs = pgTable(
  "processing_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    durationMs: integer("duration_ms").notNull(),
    ok: boolean("ok").notNull().default(true),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("logs_source_idx").on(table.sourceId)],
);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Hội thoại mới"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<
      Array<{
        sourceId: string;
        chunkId: string;
        title: string;
        snippet: string;
      }>
    >(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("messages_conversation_idx").on(table.conversationId)],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),
  sources: many(sources),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  uploader: one(users, {
    fields: [sources.uploadedBy],
    references: [users.id],
  }),
  department: one(departments, {
    fields: [sources.departmentId],
    references: [departments.id],
  }),
  chunks: many(documentChunks),
  permissions: many(sourcePermissions),
}));

export const chunksRelations = relations(documentChunks, ({ one }) => ({
  source: one(sources, {
    fields: [documentChunks.sourceId],
    references: [sources.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type Department = typeof departments.$inferSelect;
