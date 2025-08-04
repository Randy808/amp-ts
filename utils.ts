import { createHash, createHmac } from "crypto";
import { GAIT_GENERATION_NONCE } from "./constants";
import * as readline from "readline";
const fs = require("fs").promises;

export function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  let result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return createHmac("sha512", Buffer.from(key))
    .update(Buffer.from(data))
    .digest();
}

export function sha256(input: Uint8Array | Buffer | string): Uint8Array {
  const hash = createHash("sha256");
  hash.update(input);
  return new Uint8Array(hash.digest());
}

export function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getGaitPathBytes(
  chainCode: Uint8Array,
  pubKey: Uint8Array
): Uint8Array {
  const pathData = concatUint8Arrays(chainCode, pubKey);
  return hmacSha512(GAIT_GENERATION_NONCE, pathData);
}

export function formatBitcoinMessageHash(message) {
  const prefix = "\x18Bitcoin Signed Message:\n";
  function varint(n) {
    if (n < 253) return Uint8Array.of(n);
    throw new Error("Message too long");
  }
  const msgBytes = new TextEncoder().encode(message);
  const buf = new Uint8Array(prefix.length + 1 + msgBytes.length);
  buf.set(new TextEncoder().encode(prefix), 0);
  buf[prefix.length] = msgBytes.length;
  buf.set(msgBytes, prefix.length + 1);
  return sha256(sha256(buf));
}

export async function writeFile(filePath: string, data: string) {
  try {
    await fs.writeFile(filePath, data);
  } catch (err) {
    console.error("Failed to write file:", err);
  }
}

export async function readFile(filePath: string) {
  try {
    const seedPhrase = await fs.readFile(filePath, { encoding: "utf8" });
    return seedPhrase;
  } catch (err) {
    console.error("Failed to read file:", err);
    return null;
  }
}

export async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}
