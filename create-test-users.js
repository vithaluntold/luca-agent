#!/usr/bin/env tsx

/**
 * Create Test Users Script
 * Creates test users in the database for development and testing
 */

import { storage } from './server/pgStorage.js';
import bcrypt from 'bcryptjs';

const testUsers = [
  {
    email: 'admin@luca.com',
    password: 'Admin123!',
    name: 'Admin User',
    isAdmin: true,
    subscriptionTier: 'enterprise'
  },
  {
    email: 'test@luca.com', 
    password: 'TestUser123!',
    name: 'Test User',
    isAdmin: false,
    subscriptionTier: 'professional'
  },
  {
    email: 'demo@luca.com',
    password: 'DemoUser123!', 
    name: 'Demo User',
    isAdmin: false,
    subscriptionTier: 'free'
  },
  {
    email: 'john@example.com',
    password: 'Password123!',
    name: 'John Doe',
    isAdmin: false,
    subscriptionTier: 'free'
  }
];

async function createTestUsers() {
  console.log('🚀 Creating test users with proper password requirements...\n');
  
  for (const userData of testUsers) {
    try {
      // Delete existing user first
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        console.log(`🗑️  Deleting existing user ${userData.email}...`);
        await storage.deleteUserData(existingUser.id);
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // Create user
      const user = await storage.createUser({
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        subscriptionTier: userData.subscriptionTier,
        isAdmin: userData.isAdmin
      });
      
      console.log(`✅ Created user: ${userData.email}`);
      console.log(`   Name: ${userData.name}`);
      console.log(`   Role: ${userData.isAdmin ? 'Admin' : 'User'}`);
      console.log(`   Tier: ${userData.subscriptionTier}`);
      console.log(`   Password: ${userData.password}`);
      console.log('');
      
    } catch (error) {
      console.error(`❌ Failed to create user ${userData.email}:`, error.message);
    }
  }
  
  console.log('🎉 Test user creation complete!');
  console.log('\n📋 Login Credentials Summary:');
  console.log('═══════════════════════════════════════');
  
  testUsers.forEach(user => {
    console.log(`👤 ${user.name} (${user.isAdmin ? 'Admin' : 'User'})`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${user.password}`);
    console.log(`   Tier: ${user.subscriptionTier}`);
    console.log('');
  });
  
  process.exit(0);
}

// Handle errors gracefully
createTestUsers().catch(error => {
  console.error('❌ Error creating test users:', error);
  process.exit(1);
});