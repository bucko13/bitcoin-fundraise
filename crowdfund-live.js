'use strict';

const bcoin = require('bcoin');
const MTX = bcoin.mtx;
const HashTypes = bcoin.script.hashType;

const fundingTarget = 100000000; // 1 BTC
const network = 'testnet';
console.log('hashtypes: ', HashTypes);

(async () => {
const client = await new bcoin.http.Client({ network });

// Step 1: Create a blank mtx
const fundMe = new MTX();

// Step 2:
// Add an output with the target amount
// you would like to raise and an address you control

const fundeeWallet = await new bcoin.http.Wallet({
    id: 'primary',
    network
  });
const fundeeAddress = await fundeeWallet.createAddress('default');

// need this because can't serialize and output mtx with no input
fundMe.addInput(new bcoin.primitives.Input());

fundMe.addOutput({value: fundingTarget, address: fundeeAddress.address });

// Step 3: Get funder wallet, find coins to fund with, add input, and sign

// check if the wallet exists and if not create it.
let funderWallet = await client.getWallet('funder-1');

if (!funderWallet) {
  await client.createWallet({id: 'funder-1'});
}

funderWallet = await new bcoin.http.Wallet({
  id: 'funder-1',
  network
});

// Note that the following steps assume the funder wallet has balance > 0

// get coins in funder wallet.
// (Alt: could just add fake coinbase transactions to fund with,
// probably necessary if including the step to create new wallet)

// Check if coin exists with the exact amount
// If no exact amount coin-
  // create and broadcast transaction to self with amount (plus change)

// Get coin that has amount you want to fund for

// Add coin as input to fundMe tx and sign the tx

// Check if tx is fully funded

  // if not fully funded then repeat funding steps (maybe with other wallets)

// Step 4: When fully funded, add input to cover tx fee, sign, and broadcast

// If fully funded
  // Get size of transaction and calculate satoshis per byte for tx fee

  // add final input to cover tx fee from the fundeeWallet

  // Sign and broadcast tx

console.log('transaction: ', fundMe);
})();

/** *****
NOTES:
- need to account for change addresses:
    - only "exact" UTXOs added, so process for in-exact would be
      to split a UTXO first sending to yourself
- need to account for who pays the fee
  - maybe the receiver adds one final input that is entirely for fee

Extra Features:
- funder that does "matching donations"
- need to account for change addresses
- need to account for who pays the fee (probably should be the receiver)
***** **/
