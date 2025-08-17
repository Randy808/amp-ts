import AmpWallet from "./amp-wallet";
import { askQuestion } from "./utils";

async function main() {
  let wallet: AmpWallet | undefined;

  try {
    wallet = await AmpWallet.createWallet("testnet");
  } catch (e) {
    wallet = await AmpWallet.readSeedFromFile("testnet");
  }

  await wallet.register();
  await wallet.login();
  await wallet.createAMPSubaccount();
  await wallet.getNewAddress();
  let addresses = await wallet.listAddresses();
  console.log(
    `Send testnet L-BTC to the following address (use liquidtestnet.com for faucet):\n${addresses[0].ad}`
  );
  await askQuestion("Press enter once your transaction is confirmed...");

  let outputs = await wallet.getUnspentOutputs();
  let txDetails = await wallet.spendUnconfidentialLbtcOutput({
    hexP2wshScript: addresses[0].script,
    hexTxId: outputs[0].txhash,
    utxoAmountInSats: parseInt(outputs[0].value),
    amountToSendInSats: 10000,
    recipientAddress: addresses[0].ad,
    feeInSats: 500,
    prevoutIndex: outputs[0].pt_idx,
  });

  console.log(`Transaction sent successfully: ${JSON.stringify(txDetails)}`)
}

(async () => {
  try {
    await main();
  } catch (err) {
    console.error(err);
  }
})();
