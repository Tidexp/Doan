import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { listAccessibleSourceIds } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { runRag } from "@/lib/langgraph/router";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, session.user.id))
    .orderBy(desc(conversations.createdAt));
  return NextResponse.json({ conversations: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    question?: string;
    conversationId?: string;
  };
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const allowedSourceIds = await listAccessibleSourceIds(session.user);
  const result = await runRag({ question, allowedSourceIds });

  let conversationId = body.conversationId;
  if (!conversationId) {
    const [created] = await db
      .insert(conversations)
      .values({
        userId: session.user.id,
        title: question.slice(0, 80),
      })
      .returning();
    conversationId = created.id;
  }

  await db.insert(messages).values([
    { conversationId, role: "user", content: question },
    {
      conversationId,
      role: "assistant",
      content: result.answer,
      citations: result.citations,
    },
  ]);

  return NextResponse.json({
    conversationId,
    ...result,
  });
}
