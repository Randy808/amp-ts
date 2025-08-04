export default interface Subaccount {
  name: string;
  pointer: number;
  receiving_id: string;
  "2of3_backup_chaincode": any;
  "2of3_backup_pubkey": any;
  "2of3_backup_xpub": any;
  "2of3_backup_xpub_sig": any;
  type: string;
  has_txs: boolean;
  required_ca: number;
}
