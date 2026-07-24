import type { JobQueue } from "./index";
import { processJobPrep } from "@/lib/worker/process-job";
import { processRendition } from "@/lib/worker/process-rendition";
import { generateThumbnailsForTask } from "@/lib/thumbnails/generate";

export function registerAllHandlers(q: JobQueue) {
  q.registerHandler("job-prep", async ({ jobId }) => {
    await processJobPrep(jobId, q);
  });
  q.registerHandler("render-rendition", async ({ renditionId }) => {
    await processRendition(renditionId);
  });
  q.registerHandler("thumbnail-generation", async ({ taskId }) => {
    await generateThumbnailsForTask(taskId);
  });
}
