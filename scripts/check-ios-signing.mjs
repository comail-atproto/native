import { appendFileSync } from 'node:fs';

const required = [
  'IOS_DIST_CERT_BASE64', 'IOS_DIST_CERT_PASSWORD', 'APPLE_TEAM_ID',
  'IOS_PROVISIONING_PROFILE_BASE64', 'APP_STORE_CONNECT_PRIVATE_KEY',
  'APP_STORE_CONNECT_KEY_ID', 'APP_STORE_CONNECT_ISSUER_ID',
];
const missing = required.filter(name => !process.env[name]);
if (missing.length && process.env.UPLOAD_TO_TESTFLIGHT === 'true') {
  console.error(`::error::TestFlight signing is not configured. Missing repository secrets: ${missing.join(', ')}.`);
  process.exit(1);
}
appendFileSync(process.env.GITHUB_OUTPUT, `signed=${missing.length === 0}\n`);
if (missing.length) console.log('Signing is not configured; this run only checks an unsigned build.');
