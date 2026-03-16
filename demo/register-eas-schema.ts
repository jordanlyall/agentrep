import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { SchemaRegistry } = require("@ethereum-attestation-service/eas-sdk");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020";
const SCHEMA_STRING = "address agent, uint8 score, string interactionType, string context, bytes32 txRef";

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  console.log("Registering EAS schema on Base Sepolia...");
  console.log("Schema:", SCHEMA_STRING);
  console.log("Deployer:", signer.address);

  const schemaRegistry = new SchemaRegistry(SCHEMA_REGISTRY_ADDRESS);
  schemaRegistry.connect(signer);

  const tx = await schemaRegistry.register({
    schema: SCHEMA_STRING,
    resolverAddress: "0x0000000000000000000000000000000000000000",
    revocable: true,
  });

  const schemaUID = await tx.wait();
  console.log("\nSchema registered!");
  console.log("Schema UID:", schemaUID);
  console.log("\nAdd to .env:");
  console.log(`EAS_SCHEMA_UID=${schemaUID}`);
}

main().catch(console.error);
