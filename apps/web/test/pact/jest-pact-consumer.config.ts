import path from "node:path";
import type { Config } from "jest";
const config: Config = {
  rootDir: path.resolve(__dirname, "../.."),
  displayName: "@uniportal/web:pact-consumer",
  testMatch: ["<rootDir>/test/pact/**/*.pact.spec.ts"],
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  modulePathIgnorePatterns: ["<rootDir>/.next/standalone"],
};
export default config;
