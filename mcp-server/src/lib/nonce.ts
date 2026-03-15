import { ethers } from "ethers";
import { getSigner } from "./contracts.js";

let currentNonce: number | null = null;
let noncePromise: Promise<void> = Promise.resolve();

export async function sendSerializedTx(
  fn: (signer: ethers.Wallet, nonce: number) => Promise<ethers.TransactionResponse>
): Promise<ethers.TransactionReceipt> {
  return new Promise((resolve, reject) => {
    noncePromise = noncePromise.then(async () => {
      try {
        const signer = getSigner();
        if (currentNonce === null) {
          currentNonce = await signer.getNonce();
        }
        const tx = await fn(signer, currentNonce);
        currentNonce++;
        const receipt = await tx.wait();
        resolve(receipt!);
      } catch (err) {
        currentNonce = null;
        reject(err);
      }
    });
  });
}
