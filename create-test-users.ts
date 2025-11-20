/**
 * Script to create test user accounts
 * Run with: npx tsx create-test-users.ts
 */

import bcrypt from 'bcryptjs';
import { storage } from './server/pgStorage';

const testUsers = [
  {
    email: 'admin@askluca.io',
    password: 'Admin@123456',
    name: 'Luca Admin',
    subscriptionTier: 'enterprise' as const,
  },
  {
    email: 'demo@askluca.io',
    password: 'Demo@123456',
    name: 'Demo User',
    subscriptionTier: 'professional' as const,
  },
  {
    email: 'test@askluca.io',
    password: 'Test@123456',
    name: 'Test User',
    subscriptionTier: 'free' as const,
  },
];

async function createTestUsers() {
  console.log('Creating test users...\n');

  for (const userData of testUsers) {
    try {
      // Check if user already exists
      const existing = await storage.getUserByEmail(userData.email);
      if (existing) {
        console.log(`✓ User already exists: ${userData.email}`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Create user
      const user = await storage.createUser({
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        subscriptionTier: userData.subscriptionTier,
      });

      console.log(`✓ Created user: ${userData.email}`);
      console.log(`  Password: ${userData.password}`);
      console.log(`  Tier: ${userData.subscriptionTier}\n`);
    } catch (error) {
      console.error(`✗ Failed to create ${userData.email}:`, error);
    }
  }

  console.log('\nTest users created successfully!');
  console.log('\n📋 Login Credentials:\n');
  testUsers.forEach(user => {
    console.log(`Email: ${user.email}`);
    console.log(`Password: ${user.password}`);
    console.log(`Tier: ${user.subscriptionTier}`);
    console.log('---');
  });

  process.exit(0);
}

createTestUsers().catch(error => {
  console.error('Error creating test users:', error);
  process.exit(1);
});
