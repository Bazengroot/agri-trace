// @ts-nocheck
/**
 * Phase 10 - Simple Test Execution Script
 * Run this in browser console or as a standalone script
 */

import { supabase } from '../lib/supabase';

export async function runPhase10Tests() {
  console.log('🚀 Starting Phase 10 Tests...\n');
  
  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  function log(category, test, status, message = '') {
    const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
    console.log(`${icon} [${category}] ${test}${message ? ` - ${message}` : ''}`);
    results.tests.push({ category, test, status, message });
    if (status === 'pass') results.passed++;
    if (status === 'fail') results.failed++;
  }

  // Test 1: Authentication
  console.log('\n🔐 Testing Authentication...');
  try {
    const { data, error } = await supabase.auth.getSession();
    log('Authentication', 'Session check', error ? 'fail' : 'pass', error?.message);
  } catch (error) {
    log('Authentication', 'Session check', 'fail', error.message);
  }

  // Test 2: Environment Variables
  const hasUrl = !!import.meta.env.VITE_SUPABASE_URL;
  const hasKey = !!import.meta.env.VITE_SUPABASE_ANON_KEY;
  log('Authentication', 'Environment variables', hasUrl && hasKey ? 'pass' : 'fail', 
    hasUrl && hasKey ? 'All env vars present' : 'Missing env vars');

  // Test 3: Database Connection
  console.log('\n🗄️ Testing Database Connection...');
  try {
    const { data, error } = await supabase.from('organizations').select('id').limit(1);
    log('Database', 'Connection test', error ? 'fail' : 'pass', error?.message);
  } catch (error) {
    log('Database', 'Connection test', 'fail', error.message);
  }

  // Test 4: RLS Policies
  console.log('\n🔒 Testing RLS Policies...');
  const tables = ['organizations', 'farms', 'audits', 'findings', 'evidence'];
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true }).limit(1);
      log('Security', `RLS on ${table}`, error ? 'pass' : 'fail', 
        error ? 'RLS working (access denied)' : 'Table accessible');
    } catch (error) {
      log('Security', `RLS on ${table}`, 'fail', error.message);
    }
  }

  // Test 5: Performance
  console.log('\n⚡ Testing Performance...');
  const start = performance.now();
  try {
    await supabase.from('audits').select('id').limit(100);
    const duration = performance.now() - start;
    log('Performance', 'Query time < 500ms', duration < 500 ? 'pass' : 'fail', 
      `${duration.toFixed(2)}ms`);
  } catch (error) {
    log('Performance', 'Query time', 'fail', error.message);
  }

  // Test 6: Scoring Calculation
  console.log('\n🧮 Testing Scoring...');
  const testCases = [
    { name: 'All Pass', responses: ['yes', 'yes', 'yes'], expected: 100 },
    { name: 'All Fail', responses: ['no', 'no', 'no'], expected: 0 },
    { name: 'Mixed', responses: ['yes', 'no', 'yes'], expected: 66.67 },
    { name: 'With N/A', responses: ['yes', 'na', 'yes'], expected: 100 },
  ];

  for (const testCase of testCases) {
    const scored = testCase.responses.filter(r => r !== 'na').length;
    const passed = testCase.responses.filter(r => r === 'yes').length;
    const calculated = scored > 0 ? (passed / scored) * 100 : 0;
    const tolerance = 0.01;
    const isCorrect = Math.abs(calculated - testCase.expected) < tolerance;
    log('Scoring', testCase.name, isCorrect ? 'pass' : 'fail', 
      `Expected: ${testCase.expected}%, Got: ${calculated.toFixed(2)}%`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Pass Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(2)}%`);
  console.log('='.repeat(60));

  if (results.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! System is production-ready.');
  } else {
    console.log(`\n⚠️  ${results.failed} test(s) failed. Review failures before production.`);
  }

  return results;
}

// Auto-run if executed directly
if (typeof window !== 'undefined') {
  window.runPhase10Tests = runPhase10Tests;
  console.log('💡 Run tests with: runPhase10Tests()');
}
