import autobahn from "autobahn";
import * as bip66 from "bip66";
import * as liquid from "liquidjs-lib";
import { LIQUID_TESTNET_URL } from "./constants";
import { getGaitPathBytes, uint8ArrayToHex } from "./utils";
import { GetNewAddressResponse } from "./types/get-new-address-response";
import AddressResponse from "./types/address-response";
import { UnspentOutput } from "./types/unspent-output";
import SendRawTransactionResponse from "./types/send-raw-transaction-response";

export class GreenClient {
  private connection: autobahn.Connection;
  private session: autobahn.Session | null = null;
  private USER_AGENT = "[v2,sw,csv,csv_opt]";
  private ACTION_PREFIX = "com.greenaddress";

  constructor() {
    (autobahn as any).log.debug = () => {};
    (autobahn as any).log.warn = () => {};

    this.connection = new autobahn.Connection({
      url: LIQUID_TESTNET_URL,
      realm: "realm1",
    });
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.onopen = async (session) => {
        this.session = session;
        resolve();
      };
      this.connection.open();
    });
  }

  public disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.onclose = (_reason, _details) => {
        this.session = null;
        resolve();
        return true;
      };
      this.connection.close();
    });
  }

  async getChallenge(publicKey: Uint8Array): Promise<string> {
    const { address } = liquid.payments.p2pkh({
      pubkey: Buffer.from(publicKey),
      network: liquid.networks.testnet,
    });

    try {
      const challenge = await this.session!.call(
        `${this.ACTION_PREFIX}.login.get_trezor_challenge`,
        [address, true]
      );
      return challenge as string;
    } catch (e) {
      throw e;
    }
  }

  public async login(sig: Uint8Array): Promise<any> {
    const r = sig.slice(0, 32);
    const s = sig.slice(32, 64);
    const derSig = bip66.encode(r, s);

    const res = await this.session!.call(
      `${this.ACTION_PREFIX}.login.authenticate`,
      [
        uint8ArrayToHex(derSig),
        true, // minimal
        "GA",
        "",
        this.USER_AGENT,
      ]
    );
    return res;
  }

  public async getUnspentOutputs(
    num_confs: number,
    subaccount: number,
    all_coins: boolean
  ): Promise<UnspentOutput[]> {
    const res = await this.session!.call(
      `${this.ACTION_PREFIX}.txs.get_all_unspent_outputs`,
      [num_confs, subaccount, "any", all_coins]
    );
    return res as UnspentOutput[];
  }

  public async createWatchOnly(username: string, password: string) {
    // These creds are hashed in the gdk before being sent to the server since
    // they are used to derive a key that encrypts things locally on the client
    let wo_blob_key_hex = "";
    const res = await this.session!.call(
      `${this.ACTION_PREFIX}.addressbook.sync_custom`,
      [username, password, wo_blob_key_hex]
    );
    return res;
  }

  public async register(
    masterPubkey: Uint8Array,
    chainCode: Uint8Array
  ): Promise<boolean> {
    let gait_path = uint8ArrayToHex(getGaitPathBytes(chainCode, masterPubkey));
    const res = await this.session!.call(
      `${this.ACTION_PREFIX}.login.register`,
      [
        uint8ArrayToHex(masterPubkey),
        uint8ArrayToHex(chainCode),
        this.USER_AGENT,
        gait_path,
      ]
    );
    return res as boolean;
  }

  public async createAMPSubaccount(
    subaccountIndex: number,
    base58XPub: string
  ) {
    const name = "AMP";
    const type = "2of2_no_recovery";
    let xpubs = [base58XPub];
    const res = await this.session!.call(
      `${this.ACTION_PREFIX}.txs.create_subaccount_v2`,
      [subaccountIndex, name, type, xpubs]
    );

    return res;
  }

  public async getWatchOnlyUsername() {
    const res = await this.session!.call(
      `${this.ACTION_PREFIX}.addressbook.get_sync_status`,
      []
    );
    return res;
  }

  public async getAddress(subaccountIndex): Promise<GetNewAddressResponse> {
    let returnPointer = true;
    let addressType = "p2wsh";
    let fundVaultResponse: any = await this.fundVault(
      subaccountIndex,
      returnPointer,
      addressType
    );
    return fundVaultResponse;
  }

  public async signRawTx(txHex: string, blindingData?: { blinding_nonces: string[] }) {
    let twoFactorData = null;
    blindingData = blindingData ?? { blinding_nonces: ["", ""] };
    let txDetails = await this.session.call(
      `${this.ACTION_PREFIX}.vault.sign_raw_tx`,
      [txHex, twoFactorData, blindingData]
    );
    return txDetails;
  }

  public async sendRawTx(
    txHex,
    blindingNonces: { blinding_nonces: string[] }
  ): Promise<SendRawTransactionResponse> {
    let twoFactorData = null;
    //Arr should equal the num of outputs
    let blindingData = blindingNonces;
    let txDetails = await this.session.call(
      `${this.ACTION_PREFIX}.vault.send_raw_tx`,
      [txHex, twoFactorData, blindingData]
    );
    return txDetails as SendRawTransactionResponse;
  }

  public async listAddresses(subaccountIndex): Promise<AddressResponse[]> {
    let addresses = await this.session.call(
      `${this.ACTION_PREFIX}.addressbook.get_my_addresses`,
      [subaccountIndex, null]
    );
    return addresses as Promise<AddressResponse[]>;
  }

  private async fundVault(subaccountIndex, returnPointer, addressType) {
    //THE RESPONSE TO THIS MAY SAY 'P2WSH' BUT IT'S ACTUALLY 'P2SH-P2WSH'
    const res = await this.session!.call(`${this.ACTION_PREFIX}.vault.fund`, [
      subaccountIndex,
      returnPointer,
      addressType,
    ]);
    return res;
  }
}
