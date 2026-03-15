import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { EAS, SchemaRegistry, SchemaEncoder } = require("@ethereum-attestation-service/eas-sdk");
import { getSigner } from "./contracts.js";

const EAS_ADDRESS = "0x4200000000000000000000000000000000000021";
const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020";

const SCHEMA_STRING = "address agent, uint8 score, string interactionType, string context, bytes32 txRef";

let schemaUID: string | null = process.env.EAS_SCHEMA_UID || null;

export function getEAS() {
  const eas = new EAS(EAS_ADDRESS);
  eas.connect(getSigner());
  return eas;
}

export async function registerSchema(): Promise<string> {
  const schemaRegistry = new SchemaRegistry(SCHEMA_REGISTRY_ADDRESS);
  schemaRegistry.connect(getSigner());

  const tx = await schemaRegistry.register({
    schema: SCHEMA_STRING,
    resolverAddress: "0x0000000000000000000000000000000000000000",
    revocable: true,
  });

  schemaUID = await tx.wait();
  console.error("EAS Schema registered:", schemaUID);
  return schemaUID!;
}

export async function createAttestation(
  agent: string,
  score: number,
  interactionType: string,
  context: string,
  txRef: string = "0x" + "0".repeat(64)
): Promise<{ uid: string; txHash: string }> {
  if (!schemaUID) throw new Error("Schema not registered. Set EAS_SCHEMA_UID in .env or call registerSchema()");

  const eas = getEAS();
  const encoder = new SchemaEncoder(SCHEMA_STRING);
  const encodedData = encoder.encodeData([
    { name: "agent", value: agent, type: "address" },
    { name: "score", value: score, type: "uint8" },
    { name: "interactionType", value: interactionType, type: "string" },
    { name: "context", value: context, type: "string" },
    { name: "txRef", value: txRef, type: "bytes32" },
  ]);

  const tx = await eas.attest({
    schema: schemaUID,
    data: {
      recipient: agent,
      expirationTime: 0n,
      revocable: true,
      data: encodedData,
    },
  });

  const uid = await tx.wait();
  return { uid: uid!, txHash: (tx as any).tx?.hash ?? "" };
}

export function getSchemaUID(): string | null {
  return schemaUID;
}

export function setSchemaUID(uid: string) {
  schemaUID = uid;
}
