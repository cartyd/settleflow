import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create test agency
  const agency = await prisma.agency.upsert({
    where: { code: 'TEST-001' },
    update: {},
    create: {
      name: 'Test Moving Agency',
      code: 'TEST-001',
      active: true,
    },
  });

  console.log('Created agency:', agency.name);

  // Create test drivers
  const driver1 = await prisma.driver.create({
    data: {
      agencyId: agency.id,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '555-0101',
      active: true,
    },
  });

  const driver2 = await prisma.driver.create({
    data: {
      agencyId: agency.id,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      phone: '555-0102',
      active: true,
    },
  });

  console.log('Created drivers:', driver1.firstName, driver2.firstName);

  // Create test settlement batch
  const batch = await prisma.settlementBatch.create({
    data: {
      agencyId: agency.id,
      nvlPaymentRef: 'CHECK-12345',
      status: 'CREATED',
      weekStartDate: new Date('2024-01-01'),
      weekEndDate: new Date('2024-01-07'),
      totalRevenue: 15000.0,
      totalAdvances: 2500.0,
      totalDeductions: 800.0,
      netAmount: 11700.0,
    },
  });

  console.log('Created settlement batch:', batch.nvlPaymentRef);

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
