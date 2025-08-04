export interface UnspentOutput {
  block_height: number;
  txhash: string;
  pt_idx: number;
  subaccount: number;
  pointer: number;
  script_type: number;
  user_status: number;
  value: string;
  subtype: number;
  asset_tag: string;
  script: string;
  commitment: string;
  nonce_commitment: string;
  surj_proof: string;
  range_proof: string;
}
