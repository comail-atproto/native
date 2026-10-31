import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const digest = data => createHash('sha256').update(data).digest('hex');

export function installProfiles(data, destinations, stateDir) {
  const state = { digest: digest(data), files: [] };
  try {
    for (const destination of destinations) {
      if (fs.existsSync(destination)) {
        if (!fs.readFileSync(destination).equals(data)) throw new Error(`Profile already exists: ${destination}`);
        continue;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, data, { flag: 'wx', mode: 0o600 });
      state.files.push(destination);
    }
  } finally {
    fs.writeFileSync(path.join(stateDir, 'installed-profiles.json'), JSON.stringify(state), { mode: 0o600 });
  }
}

export function cleanupProfiles(stateDir) {
  const manifest = path.join(stateDir, 'installed-profiles.json');
  if (!fs.existsSync(manifest)) return;
  const state = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  for (const file of state.files) {
    if (!fs.existsSync(file)) continue;
    if (digest(fs.readFileSync(file)) === state.digest) fs.unlinkSync(file);
    else console.warn(`Preserving profile changed during the build: ${file}`);
  }
}

function run(command, args, input) {
  try {
    return execFileSync(command, args, { input, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  } catch (error) {
    // Native command errors include their arguments, including import passwords.
    throw new Error(`${path.basename(command)} ${args[0]} failed (status ${error.status}).`);
  }
}

function install(stateDir) {
  fs.mkdirSync(stateDir, { mode: 0o700 });
  const keychain = path.join(stateDir, 'build.keychain-db');
  const keychains = run('/usr/bin/security', ['list-keychains', '-d', 'user'])
    .trim().split('\n').filter(Boolean).map(line => JSON.parse(line.trim()));
  const password = randomUUID();
  run('/usr/bin/security', ['create-keychain', '-p', password, keychain]);
  run('/usr/bin/security', ['set-keychain-settings', '-lut', '21600', keychain]);
  run('/usr/bin/security', ['unlock-keychain', '-p', password, keychain]);

  // A keychain-scoped codesign lookup also needs the distribution issuer.
  const intermediate = path.join(stateDir, 'AppleWWDRCAG3.cer');
  run('/usr/bin/curl', ['--fail', '--silent', '--show-error', '--location', '--connect-timeout', '15', '--max-time', '60', '--output', intermediate,
    'https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer']);
  run('/usr/bin/security', ['import', intermediate, '-k', keychain]);

  const certificate = path.join(stateDir, 'dist.p12');
  fs.writeFileSync(certificate, Buffer.from(process.env.CERT_BASE64, 'base64'), { mode: 0o600 });
  try {
    run('/usr/bin/security', ['import', certificate, '-k', keychain, '-P', process.env.CERT_PASSWORD,
      '-T', '/usr/bin/codesign', '-T', '/usr/bin/security', '-f', 'pkcs12']);
  } finally {
    fs.rmSync(certificate, { force: true });
  }
  run('/usr/bin/security', ['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, keychain]);
  run('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', keychain, ...keychains]);
  const identities = [...run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning', keychain])
    .matchAll(/^\s*\d+\) ([A-F0-9]{40}) "Apple Distribution:/gm)];
  if (identities.length !== 1) throw new Error('Expected one valid Apple Distribution identity in the temporary keychain.');

  const keyDir = path.join(stateDir, 'private_keys');
  fs.mkdirSync(keyDir, { mode: 0o700 });
  const keyId = process.env.ASC_KEY_ID;
  if (!/^[A-Z0-9]+$/.test(keyId)) throw new Error('Invalid App Store Connect key ID.');
  fs.writeFileSync(path.join(keyDir, `AuthKey_${keyId}.p8`), Buffer.from(process.env.ASC_KEY_BASE64, 'base64'), { mode: 0o600 });

  const data = Buffer.from(process.env.PROFILE_BASE64, 'base64');
  const profile = run('/usr/bin/security', ['cms', '-D'], data);
  const field = name => run('/usr/bin/plutil', ['-extract', name, 'raw', '-'], profile).trim();
  const uuid = field('UUID');
  if (!/^[A-Fa-f0-9-]+$/.test(uuid)) throw new Error('Invalid provisioning profile UUID.');
  const appId = field('Entitlements.application-identifier');
  const config = createRequire(import.meta.url)('../app.config.js').expo;
  if (appId !== `${process.env.TEAM_ID}.${config.ios.bundleIdentifier}`) throw new Error('Provisioning profile does not match the Comail app and team.');
  installProfiles(data, [
    path.join(os.homedir(), 'Library/MobileDevice/Provisioning Profiles', `${uuid}.mobileprovision`),
    path.join(os.homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles', `${uuid}.mobileprovision`),
  ], stateDir);
  const outputs = { uuid, name: field('Name'), bundle_id: config.ios.bundleIdentifier, identity: identities[0][1] };
  for (const [name, value] of Object.entries(outputs)) {
    if (/[\r\n]/.test(value)) throw new Error('Invalid multiline signing output.');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
  console.log(`Installed signing profile for ${outputs.bundle_id}.`);
}

function cleanup(stateDir) {
  const keychain = path.join(stateDir, 'build.keychain-db');
  let failure;
  try {
    if (fs.existsSync(keychain)) run('/usr/bin/security', ['delete-keychain', keychain]);
  } catch (error) { failure = error; }
  try {
    cleanupProfiles(stateDir);
  } finally {
    fs.rmSync(path.join(stateDir, 'private_keys'), { recursive: true, force: true });
  }
  if (failure) throw failure;
  fs.rmSync(stateDir, { recursive: true, force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.RUNNER_TEMP) throw new Error('RUNNER_TEMP is required.');
    const stateDir = path.join(process.env.RUNNER_TEMP, 'comail-ios-signing');
    if (process.argv[2] === 'install') install(stateDir);
    else if (process.argv[2] === 'cleanup') cleanup(stateDir);
    else throw new Error('Usage: node scripts/ios-signing.mjs install|cleanup');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
