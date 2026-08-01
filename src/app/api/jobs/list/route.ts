import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { assertUser } from "@/lib/auth/session";

// Riwayat job untuk halaman /jobs. Ambil 50 terbaru, sertakan summary status
// agar tabel bisa tampilkan "X dari Y selesai" tanpa fetch tambahan.
export async function GET() {
  const gate = await assertUser();
  if (gate) return gate;
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      renditions: {
        select: {
          status: true,
          thumbnailKey: true,
          account: { select: { handle: true } },
        },
      },
    },
  });

  const s = storage();
  return NextResponse.json(
    jobs.map((j) => {
      const total = j.renditions.length;
      const done = j.renditions.filter((r) => r.status === "DONE").length;
      const failed = j.renditions.filter((r) => r.status === "FAILED").length;
      // Ambil thumbnail pertama yang sudah jadi supaya card di /jobs punya
      // preview visual.
      const previewThumb = j.renditions.find((r) => r.thumbnailKey);
      return {
        id: j.id,
        status: j.status,
        description: j.description,
        baseCaption: j.baseCaption,
        baseThumbText: j.baseThumbText,
        createdAt: j.createdAt,
        completedAt: j.completedAt,
        total,
        done,
        failed,
        thumbnailUrl: previewThumb?.thumbnailKey ? s.getPublicUrl(previewThumb.thumbnailKey) : null,
      };
    })
  );
}
