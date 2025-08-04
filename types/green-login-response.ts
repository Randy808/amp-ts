import Subaccount from "./subaccount";

export interface GreenLoginResponse {
  appearance: {
    unit: "BTC" | string;
    replace_by_fee: boolean;
    current_subaccount: number;
    use_segwit: boolean;
    use_csv: boolean;
  };
  block_height: number;
  block_hash: string;
  cache_password: string;
  chain_code: string;
  client_blob_hmac: string;
  country: string;
  csv_blocks: number;
  currency: "USD" | string;
  dust: number;
  earliest_key_creation_time: number;
  exchange: string;
  fee_estimates: {
    [key: string]: {
      feerate: number;
      blocks: number;
    };
  };
  gait_path: string;
  has_txs: boolean;
  min_fee: number;
  prev_block_hash: string;
  public_key: string;
  rbf: boolean;
  receiving_id: string;
  segwit: boolean;
  segwit_server: boolean;
  csv_server: boolean;
  csv_times: number[];
  subaccounts: Subaccount[]; 
  fiat_currency: string;
  fiat_exchange: string;
  reset_2fa_active: boolean;
  reset_2fa_days_remaining: number;
  reset_2fa_disputed: boolean;
  nlocktime_blocks: number;
  first_login: boolean;
  privacy: {
    send_me: number;
    show_as_sender: number;
  };
  limits: {
    total: number;
    per_tx: number;
    is_fiat: boolean;
  };
}
