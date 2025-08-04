export default interface AddressResponse {
  branch: number;
  pointer: number;
  ad: string;
  addr_type: string;
  script: string;
  script_type: number;
  subtype: any;
  num_tx: number;
}