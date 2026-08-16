#!/usr/bin/env node
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) process.exit(0);

const appPassword = process.env.DATABASE_APP_PASSWORD;
const systemPassword = process.env.DATABASE_SYSTEM_PASSWORD;
if (!appPassword || !systemPassword) {
  console.error('DATABASE_APP_PASSWORD and DATABASE_SYSTEM_PASSWORD are required with DATABASE_ADMIN_URL.');
  process.exit(2);
}

const quoteForShell = (value) => `'${value.replace(/'/g, "'\\''")}'`;
const buildUrl = (username, password) => {
  const url = new URL(adminUrl);
  url.username = username;
  url.password = password;
  return url.toString();
};

if (!process.env.DATABASE_URL) {
  process.stdout.write(`export DATABASE_URL=${quoteForShell(buildUrl(process.env.DATABASE_APP_USER || 'uniportal_app', appPassword))}\n`);
}
if (!process.env.DATABASE_DIRECT_URL) {
  process.stdout.write(`export DATABASE_DIRECT_URL=${quoteForShell(buildUrl(process.env.DATABASE_SYSTEM_USER || 'uniportal_system', systemPassword))}\n`);
}
