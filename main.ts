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

  try {
    await wallet.createAMPSubaccount();
  } catch (e) {
    if (e.args.includes("Subaccount already exists")) {
      console.log("Subaccount exists, skipping subaccount creation...");
    } else {
      throw e;
    }
  }

  // await wallet.getNewAddress();
  let addresses = await wallet.listAddresses();
  const oldestAddressIndex = addresses.length - 1;
  console.log(
    `Send testnet L-BTC to the following address (use liquidtestnet.com for faucet):\n${addresses[oldestAddressIndex].ad}`
  );
  await askQuestion("Press enter once your transaction is confirmed...");

  let outputs = await wallet.getUnspentOutputs();
  let txDetails = await wallet.spendUnconfidentialLbtcOutput({
    hexP2wshScript: addresses[oldestAddressIndex].script,
    hexTxId: outputs[0].txhash,
    utxoAmountInSats: parseInt(outputs[0].value),
    amountToSendInSats: 10000,
    recipientAddress: addresses[0].ad,
    feeInSats: 500,
    prevoutIndex: outputs[0].pt_idx,
  });

  console.log(`Transaction sent successfully: ${JSON.stringify(txDetails)}`);
}

(async () => {
  try {
    await main();
  } catch (err) {
    console.error(err);
  }
})();
