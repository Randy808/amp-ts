import { BIP32Factory, BIP32Interface } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { NetworkString } from "./types/network-string";
const bip32 = BIP32Factory(ecc);

export default class AmpSigner {
  private node: BIP32Interface;
  private network: NetworkString;

  private constructor(bip32Key: BIP32Interface, network: NetworkString) {
    this.node = bip32Key;
    this.network = network;
  }

  static fromBase58XPriv(
    base58PrivateKey: string,
    network: NetworkString,
    forceNetworkConversion: boolean = false
  ) {
    if (network === "mainnet") {
      network = "bitcoin";
    }

    if (!["regtest", "testnet", "bitcoin"].includes(network)) {
      throw new Error(`Unrecognized network '${network}'`);
    }

    let _network = bitcoin.networks[network];
    let bip32Keypair: BIP32Interface | undefined;

    if (forceNetworkConversion) {
      let sourceNetwork: string = "";
      switch (base58PrivateKey.charAt(0)) {
        case "t":
          sourceNetwork = "testnet";
          break;
        case "x":
          sourceNetwork = "bitcoin";
          break;
        default:
          throw new Error("Unrecognized private key network");
      }

      let originalBip32Keypair = bip32.fromBase58(
        base58PrivateKey,
        bitcoin.networks[sourceNetwork]
      );
      bip32Keypair = bip32.fromPrivateKey(
        originalBip32Keypair.privateKey,
        originalBip32Keypair.chainCode,
        _network
      );
    } else {
      bip32Keypair = bip32.fromBase58(base58PrivateKey, _network);
    }

    return new AmpSigner(bip32Keypair, network);
  }

  static fromSeed(seed: Uint8Array, network: NetworkString) {
    let _network = bitcoin.networks[network];
    let bip32Keypair = bip32.fromSeed(seed, _network);
    return new AmpSigner(bip32Keypair, network);
  }

  getPubkey(): Uint8Array {
    return this.node.publicKey;
  }

  getChainCode(): Uint8Array {
    return this.node.chainCode;
  }

  getNetwork(): NetworkString {
    return this.network;
  }

  derivePath(path: string): BIP32Interface {
    return this.node.derivePath(path);
  }

  derive(index: number) {
    return this.node.derive(index);
  }

  sign(msg, lowR?) {
    return this.node.sign(msg, lowR);
  }
}
