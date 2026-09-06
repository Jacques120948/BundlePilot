import { PrismaClient, PlanTier } from "@prisma/client";
import { DEFAULT_ENTITLEMENTS } from "../app/lib/entitlements.server";

const prisma = new PrismaClient();

async function main() {
  for (const plan of Object.keys(DEFAULT_ENTITLEMENTS) as PlanTier[]) {
    const defaults = DEFAULT_ENTITLEMENTS[plan];
    await prisma.featureEntitlement.upsert({
      where: { plan },
      create: { plan, ...defaults },
      update: defaults,
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
