import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { departments, users } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/auth/guards";
import { USER_ROLES } from "@/lib/auth/users";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 1024 * 1024;
const MAX_ROWS = 500;

type CsvRow = {
  line: number;
  name: string;
  email: string;
  role: (typeof USER_ROLES)[number];
  departmentId: string | null;
  status: "ready" | "invalid" | "exists" | "duplicate" | "imported";
  message: string;
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (
      closedQuote &&
      character !== "," &&
      character !== "\n" &&
      character !== "\r" &&
      !/\s/.test(character)
    ) {
      throw new Error("CSV có ký tự không hợp lệ sau dấu ngoặc kép.");
    }

    if (character === '"') {
      if (field.length > 0) throw new Error("CSV có dấu ngoặc kép không hợp lệ.");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
      closedQuote = false;
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      closedQuote = false;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV chưa đóng dấu ngoặc kép.");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const rowSchema = z.object({
  name: z.string().trim().min(1, "Thiếu họ tên.").max(120, "Họ tên quá dài."),
  email: z.string().trim().email("Email không hợp lệ.").max(254),
  role: z.enum(USER_ROLES, { error: "Vai trò không hợp lệ." }),
  department: z.string().trim().max(120, "Tên phòng ban quá dài."),
});

async function validateCsv(text: string) {
  let records: string[][];
  try {
    records = parseCsv(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "CSV không hợp lệ.",
    } as const;
  }

  if (records.length < 2) {
    return { error: "CSV cần có dòng tiêu đề và ít nhất một người dùng." } as const;
  }
  if (records.length - 1 > MAX_ROWS) {
    return { error: `Mỗi lần chỉ được nhập tối đa ${MAX_ROWS} người dùng.` } as const;
  }

  const headers = records[0].map((header) => header.trim().toLowerCase());
  const allowedHeaders = ["name", "email", "role", "department"];
  if (
    !headers.includes("name") ||
    !headers.includes("email") ||
    headers.some((header) => !allowedHeaders.includes(header)) ||
    new Set(headers).size !== headers.length
  ) {
    return {
      error: "Tiêu đề phải gồm name,email; role và department là tùy chọn.",
    } as const;
  }

  const indexes = {
    name: headers.indexOf("name"),
    email: headers.indexOf("email"),
    role: headers.indexOf("role"),
    department: headers.indexOf("department"),
  };
  const departmentRows = await db
    .select({ id: departments.id, name: departments.name, slug: departments.slug })
    .from(departments);
  const departmentsByName = new Map<string, string>();
  for (const department of departmentRows) {
    departmentsByName.set(department.name.trim().toLowerCase(), department.id);
    departmentsByName.set(department.slug.trim().toLowerCase(), department.id);
  }

  const seenEmails = new Set<string>();
  const parsedRows: CsvRow[] = records.slice(1).map((cells, index) => {
    const cell = (cellIndex: number) =>
      cellIndex >= 0 ? (cells[cellIndex] ?? "").trim() : "";
    const rawEmail = cell(indexes.email).toLowerCase();
    const isDuplicate = Boolean(rawEmail) && seenEmails.has(rawEmail);
    if (rawEmail) seenEmails.add(rawEmail);

    if (cells.slice(headers.length).some((extra) => extra.trim())) {
      return {
        line: index + 2,
        name: cell(indexes.name),
        email: rawEmail,
        role: "employee",
        departmentId: null,
        status: "invalid",
        message: "Dòng có nhiều cột hơn tiêu đề CSV.",
      };
    }

    const parsed = rowSchema.safeParse({
      name: cell(indexes.name),
      email: rawEmail,
      role: cell(indexes.role) || "employee",
      department: cell(indexes.department),
    });

    if (!parsed.success) {
      return {
        line: index + 2,
        name: cell(indexes.name),
        email: rawEmail,
        role: "employee",
        departmentId: null,
        status: isDuplicate ? "duplicate" : "invalid",
        message: isDuplicate
          ? "Email bị lặp trong CSV."
          : parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.",
      };
    }

    if (isDuplicate) {
      return {
        line: index + 2,
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        departmentId: null,
        status: "duplicate",
        message: "Email bị lặp trong CSV.",
      };
    }

    const departmentId = parsed.data.department
      ? departmentsByName.get(parsed.data.department.toLowerCase())
      : null;
    if (parsed.data.department && !departmentId) {
      return {
        line: index + 2,
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        departmentId: null,
        status: "invalid",
        message: `Không tìm thấy phòng ban "${parsed.data.department}".`,
      };
    }

    return {
      line: index + 2,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      departmentId: departmentId ?? null,
      status: "ready",
      message: "Sẵn sàng nhập.",
    };
  });

  const candidateEmails = [
    ...new Set(
      parsedRows
        .filter((row) => row.status === "ready")
        .map((row) => row.email),
    ),
  ];
  if (candidateEmails.length) {
    const existingRows = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.email, candidateEmails));
    const existingEmails = new Set(
      existingRows.map((row) => row.email.toLowerCase()),
    );
    for (const row of parsedRows) {
      if (row.status === "ready" && existingEmails.has(row.email)) {
        row.status = "exists";
        row.message = "Email đã có tài khoản.";
      }
    }
  }

  return { rows: parsedRows } as const;
}

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: "Chọn một tệp CSV hợp lệ." },
      { status: 400 },
    );
  }
  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Tệp CSV phải có nội dung và không quá 1 MB." },
      { status: 400 },
    );
  }

  const validation = await validateCsv(await file.text());
  if ("error" in validation) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const rows = validation.rows;
  const shouldCommit = formData.get("commit") === "true";
  if (!shouldCommit) {
    return NextResponse.json({
      rows,
      readyCount: rows.filter((row) => row.status === "ready").length,
    });
  }

  const candidates = rows.filter((row) => row.status === "ready");
  if (candidates.length) {
    const inserted = await db
      .insert(users)
      .values(
        candidates.map((row) => ({
          name: row.name,
          email: row.email,
          role: row.role,
          departmentId: row.departmentId,
          passwordHash: null,
          active: true,
        })),
      )
      .onConflictDoNothing({ target: users.email })
      .returning({ email: users.email });
    const insertedEmails = new Set(
      inserted.map((user) => user.email.toLowerCase()),
    );

    for (const row of rows) {
      if (row.status !== "ready") continue;
      if (insertedEmails.has(row.email)) {
        row.status = "imported";
        row.message = "Đã tạo tài khoản Google.";
      } else {
        row.status = "exists";
        row.message = "Email đã có tài khoản.";
      }
    }
  }

  return NextResponse.json({
    rows,
    readyCount: 0,
    importedCount: rows.filter((row) => row.status === "imported").length,
  });
}
