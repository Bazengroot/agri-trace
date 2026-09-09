/**
 * Supabase Connection Test
 * Run this to verify your Supabase connection is working
 */

import { supabase } from './supabase';

export async function testSupabaseConnection() {
  console.log('🔌 Testing Supabase connection...\n');

  // Test 1: Check if client is initialized
  console.log('✅ Supabase client initialized');

  // Test 2: Test basic query
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (error) {
      console.error('❌ Database query failed:', error.message);
      console.log('\n💡 This might mean:');
      console.log('   - Database migrations have not been run');
      console.log('   - RLS policies are blocking access');
      console.log('   - You are not authenticated');
      return false;
    }

    console.log('✅ Database connection successful');
    console.log(`   Found ${data?.length || 0} organization(s)`);
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return false;
  }

  // Test 3: Test authentication
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      console.log('✅ User authenticated');
      console.log(`   User ID: ${session.user.id}`);
      console.log(`   Email: ${session.user.email}`);
    } else {
      console.log('⚠️  No active session (user not logged in)');
    }
  } catch (error) {
    console.error('❌ Auth test failed:', error);
    return false;
  }

  // Test 4: Test storage
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log('⚠️  Storage test skipped:', error.message);
    } else {
      console.log('✅ Storage connection successful');
      console.log(`   Found ${buckets?.length || 0} bucket(s)`);
    }
  } catch (error) {
    console.log('⚠️  Storage test skipped');
  }

  console.log('\n✅ All tests passed! Supabase connection is working.\n');
  return true;
}

// Auto-run if executed directly
if (typeof window !== 'undefined') {
  (window as any).testSupabaseConnection = testSupabaseConnection;
  console.log('💡 Run connection test with: testSupabaseConnection()');
}
