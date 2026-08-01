import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { queue, ensureHandlersRegistered } from "@/lib/queue";
import { storage } from "@/lib/storage";
import { assertUser } from "@/lib/auth/session";

const thumbnailInputSchema = z.object({
  accountId: z.string(),
  thumbnailKey: z.string(),
  source: z.enum(["AUTO", "MANUAL"]),
  timestampSec: z.number().optional(),
});

const bodySchema = z
  .object({
    sourceKey: z.string().min(1),
    sourceDuration: z.number().optional(),
    // Dua mode input (XOR): description saja, atau baseCaption + baseThumbText.
    description: z.string().trim().min(20).max(5000).optional(),
    baseCaption: z.string().trim().min(1).max(5000).optional(),
    baseThumbText: z.string().trim().min(1).max(500).optional(),
    groupIds: z.array(z.string()).default([]),
    accountIds: z.array(z.string()).default([]),
    thumbnails: z.array(thumbnailInputSchema).optional(),
  })
  .refine((d) => d.groupIds.length > 0 || d.accountIds.length > 0, {
    message: "Minimal satu group atau satu akun harus dipilih",
    path: ["accountIds"],
  })
  .superRefine((v, ctx) => {
    const hasDesc = !!v.description;
    const hasPair = !!v.baseCaption && !!v.baseThumbText;
    if (hasDesc && hasPair) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Isi salah satu saja: description ATAU (baseCaption + baseThumbText).",
        path: ["description"],
      });
    }
    if (!hasDesc && !hasPair) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Wajib mengisi description (min 20 karakter) ATAU baseCaption + baseThumbText.",
        path: ["description"],
      });
    }
    // Kasus setengah-setengah: baseCaption tanpa baseThumbText (atau sebaliknya).
    if (!hasDesc && ((v.baseCaption && !v.baseThumbText) || (!v.baseCaption && v.baseThumbText))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "baseCaption dan baseThumbText harus diisi berpasangan.",
        path: ["baseThumbText"],
      });
    }
  });

type Excluded = {
  id: string;
  handle: string;
  reason: "INACTIVE" | "NO_TEMPLATE" | "NOT_FOUND";
};

class NoValidAccountsError extends Error {
  constructor(public excluded: Excluded[], public missingGroups: string[], public reason: "EMPTY" | "ALL_INVALID") {
    super("no-valid-accounts");
  }
}

class TooManyAccountsError extends Error {
  constructor(public total: number, public max: number) {
    super("too-many-accounts");
  }
}

const MAX_RENDITIONS_PER_JOB = 20;

export async function POST(req: Request) {
  const gate = await assertUser();
  if (gate) return gate;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const thumbnailByAccount = new Map(
    (parsed.data.thumbnails ?? []).map((t) => [t.accountId, t])
  );

  let result: {
    jobId: string;
    status: string;
    renditions: Array<{ id: string; accountId: string }>;
    validAccountIds: string[];
    excluded: Excluded[];
    missingGroups: string[];
  };

  try {
    result = await prisma.$transaction(async (tx) => {
      // 1. Resolve group → accountIds
      const groups = parsed.data.groupIds.length > 0
        ? await tx.group.findMany({
            where: { id: { in: parsed.data.groupIds } },
            include: { accounts: { select: { id: true } } },
          })
        : [];
      const foundGroupIds = new Set(groups.map((g) => g.id));
      const missingGroups = parsed.data.groupIds.filter((id) => !foundGroupIds.has(id));
      const groupAccountIds = groups.flatMap((g) => g.accounts.map((a) => a.id));

      const requestedIds = Array.from(
        new Set([...groupAccountIds, ...parsed.data.accountIds])
      );

      if (requestedIds.length === 0) {
        throw new NoValidAccountsError([], missingGroups, "EMPTY");
      }

      // 2. Validate accounts di snapshot yang sama
      const accounts = await tx.account.findMany({
        where: { id: { in: requestedIds } },
        include: { template: { select: { id: true } } },
      });

      const excluded: Excluded[] = [];
      const foundIds = new Set(accounts.map((a) => a.id));
      for (const id of requestedIds) {
        if (!foundIds.has(id)) {
          excluded.push({ id, handle: id, reason: "NOT_FOUND" });
        }
      }
      const validAccounts = accounts.filter((a) => {
        if (!a.isActive) {
          excluded.push({ id: a.id, handle: a.handle, reason: "INACTIVE" });
          return false;
        }
        if (!a.template) {
          excluded.push({ id: a.id, handle: a.handle, reason: "NO_TEMPLATE" });
          return false;
        }
        return true;
      });

      if (validAccounts.length === 0) {
        throw new NoValidAccountsError(excluded, missingGroups, "ALL_INVALID");
      }
      if (validAccounts.length > MAX_RENDITIONS_PER_JOB) {
        throw new TooManyAccountsError(validAccounts.length, MAX_RENDITIONS_PER_JOB);
      }

      // 3. Create Job + Rendition atomically
      const job = await tx.job.create({
        data: {
          sourceKey: parsed.data.sourceKey,
          sourceDuration: parsed.data.sourceDuration ?? null,
          description: parsed.data.description ?? null,
          baseCaption: parsed.data.baseCaption ?? null,
          baseThumbText: parsed.data.baseThumbText ?? null,
          status: "QUEUED",
        },
      });
      await tx.rendition.createMany({
        data: validAccounts.map((a) => ({
          jobId: job.id,
          accountId: a.id,
          status: "PENDING",
        })),
      });
      // SQLite createMany tidak return IDs — refetch di transaksi yang sama
      const renditions = await tx.rendition.findMany({
        where: { jobId: job.id },
        select: { id: true, accountId: true },
      });

      return {
        jobId: job.id,
        status: job.status,
        renditions,
        validAccountIds: validAccounts.map((a) => a.id),
        excluded,
        missingGroups,
      };
    });
  } catch (err) {
    if (err instanceof NoValidAccountsError) {
      const message =
        err.reason === "EMPTY"
          ? "Group terpilih kosong. Tambahkan anggota group atau pilih akun manual."
          : "Tidak ada akun valid setelah resolusi (semua akun nonaktif atau belum punya template).";
      return NextResponse.json(
        { error: message, excluded: err.excluded, missingGroups: err.missingGroups },
        { status: 400 }
      );
    }
    if (err instanceof TooManyAccountsError) {
      return NextResponse.json(
        {
          error: `Total akun setelah resolusi (${err.total}) melebihi batas ${err.max}. Kurangi group atau akun manual.`,
        },
        { status: 400 }
      );
    }
    throw err;
  }

  // 4. SETELAH commit: copy thumbnail preview → final (best-effort, keluar dari tx)
  await Promise.all(
    result.renditions.map(async (r) => {
      const input = thumbnailByAccount.get(r.accountId);
      if (!input) return;
      try {
        const obj = await storage().get(input.thumbnailKey);
        if (!obj) throw new Error(`Preview thumbnail tidak ditemukan: ${input.thumbnailKey}`);
        const finalKey = `renditions/pre/${result.jobId}/${r.id}/thumb.jpg`;
        await storage().put(finalKey, obj.buffer, obj.contentType || "image/jpeg");
        await prisma.rendition.update({
          where: { id: r.id },
          data: {
            thumbnailKey: finalKey,
            thumbnailSource: input.source,
            thumbnailTimestampSec: input.timestampSec ?? null,
          },
        });
      } catch (err) {
        // Non-fatal: worker akan fallback ke extract dari output (detik 2)
        console.warn(
          `[jobs] Gagal claim thumbnail untuk rendition ${r.id}: ${(err as Error).message}. ` +
            `Worker akan fallback ke thumbnail default.`
        );
      }
    })
  );

  // 5. Enqueue setelah commit + I/O — kalau rollback, worker tidak pernah lihat job palsu
  await ensureHandlersRegistered();
  const q = await queue();
  await q.enqueue("job-prep", { jobId: result.jobId });

  return NextResponse.json(
    {
      id: result.jobId,
      status: result.status,
      renditionCount: result.renditions.length,
      finalAccountIds: result.validAccountIds,
      excluded: result.excluded,
      missingGroups: result.missingGroups,
    },
    { status: 201 }
  );
}
