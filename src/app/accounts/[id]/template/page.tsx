import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { DEFAULT_LAYOUT, type TemplateLayout } from "@/types/template-layout";
import { PLATFORM_LABEL, type Platform } from "@/lib/platforms";
import { Button } from "@/components/ui/button";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id },
    include: { template: true },
  });
  if (!account) notFound();

  let initialLayout: TemplateLayout = DEFAULT_LAYOUT;
  let frameKey: string | null = null;
  let introKey: string | null = null;

  if (account.template) {
    try {
      initialLayout = JSON.parse(account.template.layout);
    } catch {
      initialLayout = DEFAULT_LAYOUT;
    }
    frameKey = account.template.frameKey;
    introKey = account.template.introKey;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1 text-caption text-text-muted hover:text-text"
        >
          <ChevronLeft className="size-3" /> Kembali ke akun
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-display text-text">{account.handle}</h1>
            <p className="mt-1 text-body text-text-muted">
              {PLATFORM_LABEL[account.platform as Platform] ?? account.platform} · {account.displayName}
            </p>
          </div>
          <Button variant="ghost" asChild>
            <Link href="/accounts">Tutup</Link>
          </Button>
        </div>
      </div>

      <TemplateEditor
        accountId={account.id}
        initialLayout={initialLayout}
        initialFrameKey={frameKey}
        initialIntroKey={introKey}
      />
    </div>
  );
}
