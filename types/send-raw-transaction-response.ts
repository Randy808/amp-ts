export default interface SendRawTransactionResponse {
  txhash: string;
  tx: string;
  limit_decrease: number;
  limits: {
    total: number;
    per_tx: number;
    is_fiat: number;
  };
}
