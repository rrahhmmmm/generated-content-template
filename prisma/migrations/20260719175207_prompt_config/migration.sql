-- AlterTable
ALTER TABLE "Account" ADD COLUMN "promptStyle" TEXT;

-- CreateTable
CREATE TABLE "PromptConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "systemPrompt" TEXT NOT NULL,
    "tiktokStyle" TEXT NOT NULL DEFAULT '',
    "instagramStyle" TEXT NOT NULL DEFAULT '',
    "youtubeStyle" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
