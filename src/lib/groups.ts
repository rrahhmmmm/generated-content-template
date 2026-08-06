import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

export const GROUPS_CACHE_TAG = "groups";

export const getGroups = unstable_cache(
  () =>
    prisma.group.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ["groups-list"],
  { tags: [GROUPS_CACHE_TAG] },
);
