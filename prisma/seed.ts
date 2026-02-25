import { prisma } from "../lib/db";
import { ensureTodayChallenge } from "../lib/server-data";

async function main() {
  const challenge = await ensureTodayChallenge(prisma);
  console.log(`Seeded daily challenge for ${challenge.date.toISOString().slice(0, 10)} -> ${challenge.songUrl}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
