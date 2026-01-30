import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("testpassword123", 12);

  const user = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: {
      email: "test@example.com",
      passwordHash,
    },
  });
  console.log(`Created user: ${user.id} (${user.email})`);

  const subscription = await prisma.subscription.upsert({
    where: { userId: user.id },
    update: { status: "active" },
    create: {
      userId: user.id,
      status: "active",
    },
  });
  console.log(`Created subscription: ${subscription.id} (${subscription.status})`);

  const existingBot = await prisma.bot.findUnique({ where: { userId: user.id } });
  if (!existingBot) {
    const bot = await prisma.bot.create({
      data: {
        userId: user.id,
        name: "Test Bot",
        status: "stopped",
      },
    });
    console.log(`Created bot: ${bot.id} (${bot.name})`);

    await prisma.botEvent.create({
      data: {
        botId: bot.id,
        type: "bot_created",
        payloadJson: JSON.stringify({ name: bot.name, seeded: true }),
      },
    });
    console.log("Created seed bot event");
  } else {
    console.log(`Bot already exists: ${existingBot.id}`);
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
