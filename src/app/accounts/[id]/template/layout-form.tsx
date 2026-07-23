"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemplateLayout, IntroCard } from "@/types/template-layout";
import {
  FONT_CATEGORY_LABEL,
  groupFontsByCategory,
  type FontCategory,
} from "@/lib/font-catalog";

type Props = {
  layout: TemplateLayout;
  onChange: (next: TemplateLayout) => void;
};

const FONT_GROUPS = groupFontsByCategory();
const FONT_CATEGORY_ORDER: FontCategory[] = ["display", "serif", "sans"];

export function LayoutForm({ layout, onChange }: Props) {
  const intro = layout.intro;

  function updateIntro(patch: Partial<IntroCard>) {
    if (!intro) return;
    onChange({ ...layout, intro: { ...intro, ...patch } });
  }
  function updateText(patch: Partial<IntroCard["text"]>) {
    if (!intro) return;
    onChange({ ...layout, intro: { ...intro, text: { ...intro.text, ...patch } } });
  }
  function updateBox(patch: Partial<IntroCard["text"]["box"]>) {
    if (!intro) return;
    onChange({
      ...layout,
      intro: { ...intro, text: { ...intro.text, box: { ...intro.text.box, ...patch } } },
    });
  }
  function updatePadding(patch: Partial<IntroCard["text"]["padding"]>) {
    if (!intro) return;
    onChange({
      ...layout,
      intro: { ...intro, text: { ...intro.text, padding: { ...intro.text.padding, ...patch } } },
    });
  }

  if (!intro) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Layout kartu intro</CardTitle>
          <CardDescription>
            Akun ini tidak memakai kartu intro. Upload PNG kartu intro di atas untuk mengaktifkan.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Layout kartu intro</CardTitle>
        <CardDescription>
          Koordinat dalam pixel absolut pada kanvas 1080×1920. Ubah dan lihat perubahan langsung di
          pratinjau kanan.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Group title="Timing">
          <NumField
            label="Mulai (detik)"
            value={intro.startSec}
            step={0.1}
            onChange={(v) => updateIntro({ startSec: v })}
          />
          <NumField
            label="Berakhir (detik)"
            value={intro.endSec}
            step={0.1}
            onChange={(v) => updateIntro({ endSec: v })}
          />
          <NumField
            label="Fade out (detik)"
            value={intro.fadeOutSec}
            step={0.05}
            onChange={(v) => updateIntro({ fadeOutSec: v })}
          />
        </Group>

        <Group title="Kotak teks (box)">
          <NumField label="x" value={intro.text.box.x} onChange={(v) => updateBox({ x: v })} />
          <NumField label="y" value={intro.text.box.y} onChange={(v) => updateBox({ y: v })} />
          <NumField label="lebar" value={intro.text.box.w} onChange={(v) => updateBox({ w: v })} />
          <NumField label="tinggi" value={intro.text.box.h} onChange={(v) => updateBox({ h: v })} />
        </Group>

        <Group title="Padding">
          <NumField label="atas" value={intro.text.padding.top} onChange={(v) => updatePadding({ top: v })} />
          <NumField label="kanan" value={intro.text.padding.right} onChange={(v) => updatePadding({ right: v })} />
          <NumField label="bawah" value={intro.text.padding.bottom} onChange={(v) => updatePadding({ bottom: v })} />
          <NumField label="kiri" value={intro.text.padding.left} onChange={(v) => updatePadding({ left: v })} />
        </Group>

        <Group title="Tipografi">
          <div className="flex flex-col gap-1.5">
            <Label>Font</Label>
            <Select value={intro.text.fontFile} onValueChange={(v) => updateText({ fontFile: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_CATEGORY_ORDER.map((cat) => {
                  const items = FONT_GROUPS[cat];
                  if (items.length === 0) return null;
                  return (
                    <SelectGroup key={cat}>
                      <SelectLabel>{FONT_CATEGORY_LABEL[cat]}</SelectLabel>
                      {items.map((f) => (
                        <SelectItem key={f.filename} value={f.filename}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <NumField
            label="Ukuran ideal (px)"
            value={intro.text.fontSize}
            onChange={(v) => updateText({ fontSize: v })}
          />
          <NumField
            label="Ukuran minimum (px)"
            value={intro.text.minFontSize}
            onChange={(v) => updateText({ minFontSize: v })}
          />
          <NumField
            label="Line height"
            step={0.01}
            value={intro.text.lineHeight}
            onChange={(v) => updateText({ lineHeight: v })}
          />
          <NumField
            label="Max baris"
            value={intro.text.maxLines}
            onChange={(v) => updateText({ maxLines: v })}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="color">Warna</Label>
            <div className="flex items-center gap-2">
              <input
                id="color"
                type="color"
                value={intro.text.color}
                onChange={(e) => updateText({ color: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded-md border border-border bg-surface"
              />
              <Input
                value={intro.text.color}
                onChange={(e) => updateText({ color: e.target.value })}
                className="font-mono"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Perataan</Label>
            <Select value={intro.text.align} onValueChange={(v) => updateText({ align: v as "left" | "center" | "right" })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Kiri</SelectItem>
                <SelectItem value="center">Tengah</SelectItem>
                <SelectItem value="right">Kanan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Uppercase</Label>
            <Select
              value={intro.text.uppercase ? "yes" : "no"}
              onValueChange={(v) => updateText({ uppercase: v === "yes" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Ya</SelectItem>
                <SelectItem value="no">Tidak</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Group>
      </CardContent>
    </Card>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-text-muted">{title}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </div>
  );
}

function NumField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </div>
  );
}
