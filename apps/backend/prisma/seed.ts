import { PrismaClient, NodeType, Role } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Pre-hashed 'password123' using bcrypt (salt rounds = 10)
const DEFAULT_PASSWORD_HASH = '$2a$10$o8/4HXog8kKK1J4SqyzroOfHM.Lu77tYFV5vC68qaMGp.TJ7K0igq';

const INVENTORY_DIR = path.join(process.cwd(), 'inventory');

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean existing records (if any) - Notice the reverse order to respect foreign key constraints
  await prisma.share.deleteMany({});
  await prisma.node.deleteMany({});
  await prisma.user.deleteMany({});

  // Recreate inventory folder to ensure clean files
  if (fs.existsSync(INVENTORY_DIR)) {
    fs.rmSync(INVENTORY_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(INVENTORY_DIR, { recursive: true });

  // 2. Create default Member and Viewer Users
  const member = await prisma.user.create({
    data: {
      email: 'member@dottraveler.com',
      password: DEFAULT_PASSWORD_HASH,
      role: Role.MEMBER,
    },
  });
  console.log(`👤 Seeded User: ${member.email}`);

  const viewer = await prisma.user.create({
    data: {
      email: 'viewer@dottraveler.com',
      password: DEFAULT_PASSWORD_HASH,
      role: Role.VIEWER,
    },
  });
  console.log(`👤 Seeded User: ${viewer.email}`);

  const admin = member; // Map references to admin.id to member.id to preserve subsequent seeding logic

  // 3. Create Main Pack Root Folder in DB
  const localRoot = await prisma.node.create({
    data: {
      id: 'local-root',
      name: 'Main Pack',
      type: NodeType.FOLDER,
      parent_id: null,
      owner_id: admin.id,
      ancestry: '',
    },
  });
  console.log('📁 Seeded Main Pack Root Folder');

  // 4. Fixed: Nest Inventory Folders under Main Pack to avoid Unique Constraint violation on null parent_ids
  const rootAncestry = `${localRoot.id}/`;

  const documents = await prisma.node.create({
    data: {
      name: 'Documents',
      type: NodeType.FOLDER,
      parent_id: localRoot.id,
      owner_id: admin.id,
      ancestry: rootAncestry,
    },
  });

  const pictures = await prisma.node.create({
    data: {
      name: 'Pictures',
      type: NodeType.FOLDER,
      parent_id: localRoot.id,
      owner_id: admin.id,
      ancestry: rootAncestry,
    },
  });

  const downloads = await prisma.node.create({
    data: {
      name: 'Downloads',
      type: NodeType.FOLDER,
      parent_id: localRoot.id,
      owner_id: admin.id,
      ancestry: rootAncestry,
    },
  });
  console.log('📁 Seeded Inventory Root Folders: Documents, Pictures, Downloads');

  // 5. Create Nested Folders under Documents (parent_id = documents.id, ancestry = "local-root/documents.id/")
  const docAncestry = `${rootAncestry}${documents.id}/`;

  const work = await prisma.node.create({
    data: {
      name: 'Work Projects',
      type: NodeType.FOLDER,
      parent_id: documents.id,
      owner_id: admin.id,
      ancestry: docAncestry,
    },
  });

  const personal = await prisma.node.create({
    data: {
      name: 'Personal Stuff',
      type: NodeType.FOLDER,
      parent_id: documents.id,
      owner_id: admin.id,
      ancestry: docAncestry,
    },
  });

  // 6. Create Nested Folders under Documents/Work Projects
  const workAncestry = `${docAncestry}${work.id}/`;

  const projectAlpha = await prisma.node.create({
    data: {
      name: 'Project Alpha',
      type: NodeType.FOLDER,
      parent_id: work.id,
      owner_id: admin.id,
      ancestry: workAncestry,
    },
  });

  // 7. Seed Files inside Project Alpha
  const alphaAncestry = `${workAncestry}${projectAlpha.id}/`;

  const welcomeNode = await prisma.node.create({
    data: {
      name: 'welcome.txt',
      type: NodeType.FILE,
      parent_id: projectAlpha.id,
      owner_id: admin.id,
      ancestry: alphaAncestry,
      path: '',
    },
  });
  const welcomePath = `inventory/${welcomeNode.id}`;
  fs.writeFileSync(path.join(INVENTORY_DIR, welcomeNode.id), 'Welcome to Project Alpha inside Dot Traveler!');
  await prisma.node.update({
    where: { id: welcomeNode.id },
    data: { path: welcomePath }
  });

  const mainNode = await prisma.node.create({
    data: {
      name: 'main.ts',
      type: NodeType.FILE,
      parent_id: projectAlpha.id,
      owner_id: admin.id,
      ancestry: alphaAncestry,
      path: '',
    },
  });
  const mainPath = `inventory/${mainNode.id}`;
  fs.writeFileSync(path.join(INVENTORY_DIR, mainNode.id), 'console.log("Hello from main.ts inside Project Alpha!");');
  await prisma.node.update({
    where: { id: mainNode.id },
    data: { path: mainPath }
  });

  // 8. Create Nested Folders & Files under Pictures
  const picAncestry = `${rootAncestry}${pictures.id}/`;

  const vacation = await prisma.node.create({
    data: {
      name: 'Europe Trip 2025',
      type: NodeType.FOLDER,
      parent_id: pictures.id,
      owner_id: admin.id,
      ancestry: picAncestry,
    },
  });

  const profilePic = await prisma.node.create({
    data: {
      name: 'profile_picture.png',
      type: NodeType.FILE,
      parent_id: pictures.id,
      owner_id: admin.id,
      ancestry: picAncestry,
      path: '',
    },
  });
  const profilePicPath = `inventory/${profilePic.id}`;
  fs.writeFileSync(path.join(INVENTORY_DIR, profilePic.id), 'FAKE_PNG_BINARY_DATA');
  await prisma.node.update({
    where: { id: profilePic.id },
    data: { path: profilePicPath }
  });

  // Seed Files under Pictures/Europe Trip 2025
  const vacationAncestry = `${picAncestry}${vacation.id}/`;

  const parisNode = await prisma.node.create({
    data: {
      name: 'paris_tower.jpg',
      type: NodeType.FILE,
      parent_id: vacation.id,
      owner_id: admin.id,
      ancestry: vacationAncestry,
      path: '',
    },
  });
  const parisPath = `inventory/${parisNode.id}`;
  fs.writeFileSync(path.join(INVENTORY_DIR, parisNode.id), 'FAKE_JPG_BINARY_PARIS_TOWER');
  await prisma.node.update({
    where: { id: parisNode.id },
    data: { path: parisPath }
  });

  // 9. Seed Folders & Files under Main Pack (localRoot)
  const localDocs = await prisma.node.create({
    data: {
      name: 'My Documents',
      type: NodeType.FOLDER,
      parent_id: localRoot.id,
      owner_id: admin.id,
      ancestry: rootAncestry,
    },
  });

  const localPics = await prisma.node.create({
    data: {
      name: 'My Pictures',
      type: NodeType.FOLDER,
      parent_id: localRoot.id,
      owner_id: admin.id,
      ancestry: rootAncestry,
    },
  });

  const localDocAncestry = `${rootAncestry}${localDocs.id}/`;

  const localWelcome = await prisma.node.create({
    data: {
      name: 'welcome.txt',
      type: NodeType.FILE,
      parent_id: localDocs.id,
      owner_id: admin.id,
      ancestry: localDocAncestry,
      path: '',
    },
  });
  const localWelcomePath = `inventory/${localWelcome.id}`;
  fs.writeFileSync(path.join(INVENTORY_DIR, localWelcome.id), 'Welcome to the Main Pack connector!');
  await prisma.node.update({
    where: { id: localWelcome.id },
    data: { path: localWelcomePath }
  });

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });