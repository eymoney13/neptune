#!/usr/bin/env node

/**
 * Script to verify Cloudflare R2 setup
 * Usage: node scripts/verify-r2-setup.js <R2_URL>
 * Example: node scripts/verify-r2-setup.js https://pub-xxxxx.r2.dev/safetoswim_geomeans_2020-present.csv
 */

const https = require('https');
const http = require('http');

const r2Url = process.argv[2];

if (!r2Url) {
  console.error('❌ Error: Please provide the R2 URL as an argument');
  console.log('\nUsage: node scripts/verify-r2-setup.js <R2_URL>');
  console.log('Example: node scripts/verify-r2-setup.js https://pub-xxxxx.r2.dev/safetoswim_geomeans_2020-present.csv');
  process.exit(1);
}

console.log('🔍 Verifying Cloudflare R2 setup...\n');
console.log(`URL: ${r2Url}\n`);

const url = new URL(r2Url);
const client = url.protocol === 'https:' ? https : http;

const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'HEAD', // Just check if file exists, don't download
  headers: {
    'User-Agent': 'Neptune-R2-Verifier/1.0'
  }
};

const req = client.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  if (res.statusCode === 200) {
    console.log('✅ File is accessible!');
    
    const contentLength = res.headers['content-length'];
    if (contentLength) {
      const sizeMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2);
      console.log(`📦 File size: ${sizeMB} MB`);
    }
    
    const contentType = res.headers['content-type'];
    if (contentType) {
      console.log(`📄 Content-Type: ${contentType}`);
    }
    
    console.log('\n✅ Setup looks good!');
    console.log('\nNext steps:');
    console.log('1. Add this URL to Vercel environment variable: NEXT_PUBLIC_CSV_URL');
    console.log('2. Redeploy your Vercel application');
    console.log('3. Test the deployed site');
  } else if (res.statusCode === 403) {
    console.log('❌ File is not publicly accessible');
    console.log('\nFix: Enable public access in Cloudflare R2 bucket settings');
  } else if (res.statusCode === 404) {
    console.log('❌ File not found');
    console.log('\nFix: Check the URL and make sure the file is uploaded');
  } else {
    console.log(`⚠️  Unexpected status code: ${res.statusCode}`);
  }
  
  // Check CORS headers
  const corsHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
  };
  
  if (corsHeaders['access-control-allow-origin']) {
    console.log('\n✅ CORS is configured');
    console.log(`   Allow-Origin: ${corsHeaders['access-control-allow-origin']}`);
  } else {
    console.log('\n⚠️  CORS headers not found');
    console.log('   This might cause issues. Configure CORS in R2 bucket settings.');
  }
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
  console.log('\nPossible issues:');
  console.log('- URL is incorrect');
  console.log('- Network connectivity issue');
  console.log('- Cloudflare R2 bucket is not accessible');
});

req.setTimeout(10000, () => {
  req.destroy();
  console.error('❌ Request timed out');
  console.log('The file might be very large or the URL is incorrect');
});

req.end();
