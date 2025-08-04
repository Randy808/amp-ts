import ECPairFactory from "ecpair";
import {
  networks,
  Psbt,
  confidential,
  address,
  witnessStackToScriptWitness,
  payments,
  script,
} from "liquidjs-lib";
let ecc = require("tiny-secp256k1");
import { GreenClient } from "./green-client";
import AmpSigner from "./amp-signer";
import { CHALLENGE_PREFIX } from "./constants";
import {
  checkFileExists,
  formatBitcoinMessageHash,
  readFile,
  writeFile,
} from "./utils";
import * as bip39 from "bip39";
import { NetworkString } from "./types/network-string";
import { GreenLoginResponse } from "./types/green-login-response";
import { GetNewAddressResponse } from "./types/get-new-address-response";
import { GAID } from "./types/gaid";
import { UnspentOutput } from "./types/unspent-output";

let NETWORK = networks.testnet;
const nonce = Buffer.from("00", "hex");
const lbtcBuffer = Buffer.concat([
  Buffer.from("01", "hex"),
  Buffer.from(NETWORK.assetHash, "hex").reverse(),
]);

const SUBACCOUNT_ID = 1;
const DEFAULT_FILE_PATH = "./seed-phrase.txt";

export default class AmpWallet {
  signer: AmpSigner;
  client: GreenClient;
  network: NetworkString;

  private constructor(
    signer: AmpSigner,
    client: GreenClient,
    network: NetworkString
  ) {
    this.signer = signer;
    this.client = client;
    this.network = network;
  }

  static async fromSigner(signer: AmpSigner): Promise<AmpWallet> {
    let wallet = new AmpWallet(signer, new GreenClient(), signer.getNetwork());
    return wallet;
  }

  static async fromSignerAndClient(
    signer: AmpSigner,
    client?: GreenClient
  ): Promise<AmpWallet> {
    let wallet = new AmpWallet(signer, client, signer.getNetwork());
    return wallet;
  }

  static async createWallet(network: NetworkString): Promise<AmpWallet> {
    const mnemonic = bip39.generateMnemonic();

    if (await checkFileExists(DEFAULT_FILE_PATH)) {
      throw new Error(
        `A seed file already exists at '${DEFAULT_FILE_PATH}', aborting...`
      );
    }

    await writeFile(DEFAULT_FILE_PATH, mnemonic);
    console.log(`Seed phrase saved to ${DEFAULT_FILE_PATH}`);

    let seed = await bip39.mnemonicToSeed(mnemonic);
    let signer = AmpSigner.fromSeed(seed, network);
    return AmpWallet.fromSigner(signer);
  }

  static async readSeedFromFile(
    network: NetworkString,
    filePath?: string
  ): Promise<AmpWallet> {
    let mnemonic = await readFile(filePath ?? DEFAULT_FILE_PATH);
    let seed = await bip39.mnemonicToSeed(mnemonic);
    let signer = AmpSigner.fromSeed(seed, network);
    return AmpWallet.fromSigner(signer);
  }

  async register() {
    await this.client.register(
      this.signer.getPubkey(),
      this.signer.getChainCode()
    );
  }

  async login(): Promise<GreenLoginResponse> {
    let challenge = await this.client.getChallenge(this.signer.getPubkey());

    const message = CHALLENGE_PREFIX + challenge;
    const hash = formatBitcoinMessageHash(message);

    const loginBip32Keypair = this.signer.derive(0x4741b11e);
    const sig = loginBip32Keypair.sign(hash, true);

    return this.client.login(loginBip32Keypair.publicKey, sig);
  }

  async getUnspentOutputs(): Promise<UnspentOutput[]> {
    const MINIMUM_CONFIRMATIONS = 0;
    return this.client.getUnspentOutputs(
      MINIMUM_CONFIRMATIONS,
      SUBACCOUNT_ID,
      true
    );
  }

  async getNewAddress(): Promise<GetNewAddressResponse> {
    return this.client.getAddress(SUBACCOUNT_ID);
  }

  spendUnconfidentialLbtcOutput({
    hexP2wshScript,
    hexTxId,
    utxoAmountInSats,
    amountToSendInSats,
    recipientAddress,
    feeInSats,
    prevoutIndex,
  }: {
    hexP2wshScript: string;
    hexTxId: string;
    utxoAmountInSats: number;
    amountToSendInSats: number;
    recipientAddress: string;
    feeInSats: number;
    prevoutIndex: number;
  }) {
    if (feeInSats >= utxoAmountInSats) {
      throw new Error(
        "The fee needs to be smaller than the value of the utxo being sent"
      );
    }

    if (amountToSendInSats + feeInSats > utxoAmountInSats) {
      throw new Error(
        "The amount needed for the receipient and fees exceeds the value of the utxo being sent " +
          `(${amountToSendInSats} + ${feeInSats} > ${utxoAmountInSats})`
      );
    }

    let p2wshScript = Buffer.from(hexP2wshScript, "hex");

    let {
      address: p2wshAddress,
      output: wshOutput,
      redeem: p2wshRedeem,
    } = payments.p2wsh({
      redeem: { output: p2wshScript },
      network: NETWORK,
    });

    let { address: p2shAddress, redeem: p2shRedeem } = payments.p2sh({
      redeem: { output: wshOutput },
      network: NETWORK,
    });

    let txid = Buffer.from(hexTxId, "hex");

    let pset = new Psbt({ network: NETWORK });
    pset
      .addInput({
        hash: txid.reverse(),
        index: prevoutIndex,
      })
      .addOutput({
        asset: lbtcBuffer,
        value: confidential.satoshiToConfidentialValue(amountToSendInSats),
        script: address.toOutputScript(recipientAddress!),
        nonce: Buffer.alloc(0),
      })
      .addOutput({
        nonce: Buffer.alloc(0),
        asset: lbtcBuffer,
        value: confidential.satoshiToConfidentialValue(feeInSats),
        script: Buffer.alloc(0),
      });

    let change = utxoAmountInSats - (amountToSendInSats + feeInSats);

    if (change > 0) {
      pset.addOutput({
        asset: lbtcBuffer,
        value: confidential.satoshiToConfidentialValue(change),
        script: address.toOutputScript(p2shAddress!),
        nonce: Buffer.alloc(0),
      });
    }

    let subaccountPath = `84/1'/${SUBACCOUNT_ID}'`;
    //First 1 is for subaccount index (since it's forcibly placed in on creation)
    //Second '1' is for address pointer
    let p = this.signer
      .derivePath(subaccountPath)
      .derive(SUBACCOUNT_ID)
      .derive(1);

    pset.data.inputs[0].witnessUtxo = {
      asset: lbtcBuffer,
      script: address.toOutputScript(p2wshAddress!), //or p2wshRedeem
      value: confidential.satoshiToConfidentialValue(utxoAmountInSats),
      nonce,
    };

    pset.data.inputs[0].witnessScript = p2wshRedeem?.output;
    let ECPair = ECPairFactory(ecc);
    pset.signInput(0, ECPair.fromPrivateKey(Buffer.from(p.privateKey!)));

    // FINALIZE
    let signature = pset?.data?.inputs?.[0]?.partialSig?.[0]?.signature;
    let serializedP2SHScript = `${p2shRedeem?.output?.toString("hex")}`;
    pset.data.inputs[0].finalScriptSig = script.fromASM(serializedP2SHScript!);

    pset.data.inputs[0].finalScriptWitness = witnessStackToScriptWitness([
      signature!,
      p2wshRedeem?.output!,
    ]);

    let txHex = pset.extractTransaction().toHex();

    let blindingNonces = {
      blinding_nonces: Array(pset.data.outputs.length).fill(""),
    };

    return this.client.sendRawTx(txHex, blindingNonces);
  }

  async createAMPSubaccount(): Promise<GAID> {
    //TODO: Use a standard derivation path
    let firstSubaccountKey = this.signer.derivePath(`84/1'/${SUBACCOUNT_ID}'`);
    let gaid = await this.client.createAMPSubaccount(
      SUBACCOUNT_ID,
      firstSubaccountKey.neutered().toBase58()
    );

    return gaid as GAID;
  }

  async listAddresses() {
    return this.client.listAddresses(SUBACCOUNT_ID);
  }

  async connectToGreen() {
    return this.client.connect();
  }
}
