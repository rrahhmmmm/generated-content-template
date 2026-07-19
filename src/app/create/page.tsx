import { EmptyState } from "@/components/empty-state";
import { Wand2 } from "lucide-react";

export default function CreatePage() {
  return (
    <EmptyState
      icon={Wand2}
      title="Belum tersedia"
      description="Halaman pembuat konten akan dibangun di Fase 4 setelah render engine dan queue selesai."
    />
  );
}
