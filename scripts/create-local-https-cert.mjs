import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
export const localCertDir = path.join(projectRoot, ".cert");
export const localCertPath = path.join(localCertDir, "awplanet-local.pem");
export const localKeyPath = path.join(localCertDir, "awplanet-local-key.pem");
export const localCaPath = path.join(localCertDir, "awplanet-local-ca.pem");

const localCaKeyPath = path.join(localCertDir, "awplanet-local-ca-key.pem");
const localCsrPath = path.join(localCertDir, "awplanet-local.csr");
const localExtensionPath = path.join(localCertDir, "awplanet-local.ext");

const runOpenSsl = (args) => {
  execFileSync("openssl", args, {
    cwd: localCertDir,
    stdio: "inherit",
  });
};

const getLocalIpv4Addresses = () => {
  const addresses = new Set(["127.0.0.1"]);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.add(entry.address);
      }
    }
  }
  return [...addresses];
};

export const ensureLocalHttpsCertificate = () => {
  mkdirSync(localCertDir, { recursive: true });

  if (!existsSync(localCaPath) || !existsSync(localCaKeyPath)) {
    runOpenSsl([
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-sha256",
      "-days",
      "3650",
      "-keyout",
      localCaKeyPath,
      "-out",
      localCaPath,
      "-subj",
      "/CN=awplanet Local Development CA",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign,cRLSign",
    ]);
  }

  runOpenSsl([
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-keyout",
    localKeyPath,
    "-out",
    localCsrPath,
    "-subj",
    "/CN=localhost",
  ]);

  const subjectAltNames = [
    "DNS:localhost",
    ...getLocalIpv4Addresses().map((address) => `IP:${address}`),
  ];
  writeFileSync(
    localExtensionPath,
    [
      "authorityKeyIdentifier=keyid,issuer",
      "basicConstraints=critical,CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      `subjectAltName=${subjectAltNames.join(",")}`,
      "",
    ].join("\n")
  );

  runOpenSsl([
    "x509",
    "-req",
    "-in",
    localCsrPath,
    "-CA",
    localCaPath,
    "-CAkey",
    localCaKeyPath,
    "-CAcreateserial",
    "-out",
    localCertPath,
    "-days",
    "825",
    "-sha256",
    "-extfile",
    localExtensionPath,
  ]);

  return {
    ca: localCaPath,
    cert: localCertPath,
    key: localKeyPath,
  };
};

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const certificate = ensureLocalHttpsCertificate();
  console.log("\nLocal HTTPS certificate ready.");
  console.log(`CA certificate: ${certificate.ca}`);
}
