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
  isAsyncFunction,
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

const DEFAULT_SUBACCOUNT_ID = 1;
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

  static fromSignerAndClient(
    signer: AmpSigner,
    client?: GreenClient
  ): AmpWallet {
    let wallet = new AmpWallet(signer, client, signer.getNetwork());
    const connectAndLoginToGreenBackend = {
      get(target, prop, receiver) {
        let _walletMethod = Reflect.get(target, prop, receiver);
        return isAsyncFunction(_walletMethod)
          ? async (args) => {
              await target.connectToGreen();
              await target.login();

              try {
                let result = await Reflect.apply(_walletMethod, target, [args]);
                return result;
              } finally {
                await target.disconnect();
              }
            }
          : _walletMethod;
      },
    };

    wallet = new Proxy(wallet, connectAndLoginToGreenBackend);
    debugger;
    return wallet;
  }

  static fromSigner(signer: AmpSigner): AmpWallet {
    return AmpWallet.fromSignerAndClient(signer, new GreenClient());
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

    return this.client.login(sig);
  }

  async getUnspentOutputs(subaccountId: number = DEFAULT_SUBACCOUNT_ID): Promise<UnspentOutput[]> {
    const MINIMUM_CONFIRMATIONS = 0;
    return this.client.getUnspentOutputs(
      MINIMUM_CONFIRMATIONS,
      subaccountId,
      true
    );
  }

  async getNewAddress(subaccountId: number = DEFAULT_SUBACCOUNT_ID): Promise<GetNewAddressResponse> {
    return this.client.getAddress(subaccountId);
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
  }, subaccountId: number = DEFAULT_SUBACCOUNT_ID) {
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

    let subaccountPath = `84/1'/${subaccountId}'`;
    //First path is for subaccount index (since it's forcibly placed in on creation)
    //Second '1' is for address pointer
    let p = this.signer
      .derivePath(subaccountPath)
      .derive(subaccountId)
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

  async createAMPSubaccount(
    subaccountId: number = DEFAULT_SUBACCOUNT_ID
  ): Promise<GAID> {
    //TODO: Use a standard derivation path
    let firstSubaccountKey = this.signer.derivePath(`84/1'/${subaccountId}'`);
    let gaid = await this.client.createAMPSubaccount(
      subaccountId,
      firstSubaccountKey.neutered().toBase58()
    );

    return gaid as GAID;
  }

  async listAddresses(subaccountId: number = DEFAULT_SUBACCOUNT_ID) {
    return this.client.listAddresses(subaccountId);
  }

  async connectToGreen() {
    return this.client.connect();
  }

  async disconnect() {
    return this.client.disconnect();
  }
}
