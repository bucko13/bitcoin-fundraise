# Bitcoin Fundraising Transaction

These are two simple apps that show you how to template transactions for use in fundraising. The idea was inspired by an idea proposed in Mastering Bitcoin by Andreas Antonopolous in [Chapter 6](https://github.com/bitcoinbook/bitcoinbook/blob/8d01749bcf45f69f36cf23606bbbf3f0bd540db3/ch06.asciidoc) in the section about SIGHASH flags.

The basic idea is to create a single transaction with a predetermined output and then you take individual contributions, i.e. inputs, where the signatures on the inputs are on the transaction excluding all other inputs (this is what an ALL|ANYONCANPAY sighash indicates). When the transaction is fully funded then you convert into an immutable transaction and can publish to the network.

## SIGHASH Flags and ALL|ANYONECANPAY
No way I could do it better than the master himself.

From "Mastering Bitcoin":
> The way SIGHASH flags are applied during signing and verification is that a copy of the transaction is made and certain fields within are truncated (set to zero length and emptied). The resulting transaction is serialized. The SIGHASH flag is added to the end of the serialized transaction and the result is hashed. The hash itself is the "message" that is signed. Depending on which SIGHASH flag is used, different parts of the transaction are truncated. The resulting hash depends on different subsets of the data in the transaction. By including the SIGHASH as the last step before hashing, the signature commits the SIGHASH type as well, so it can’t be changed (e.g., by a miner).

> ALL|ANYONECANPAY
This construction can be used to make a "crowdfunding”-style transaction. Someone attempting to raise funds can construct a transaction with a single output. The single output pays the "goal" amount to the fundraiser. Such a transaction is obviously not valid, as it has no inputs. However, others can now amend it by adding an input of their own, as a donation. They sign their own input with ALL|ANYONECANPAY. Unless enough inputs are gathered to reach the value of the output, the transaction is invalid. Each donation is a "pledge," which cannot be collected by the fundraiser until the entire goal amount is raised.

## How it works
There are two examples both built entirely with the [bcoin](http://bcoin.io) library. The first example works directly with the bcoin utilities and doesn't actually transmit anything to the network. This means it does some address/key management that would otherwise be handled by the wallet service. The second example uses wallet accounts on the bitcoin testnet. This means that in order for it to work you need to have funded wallets available in order to make test them properly.

## Extra Features
Obviously this is extremely basic. Interesting ideas for how to extend include:
- UX to let people interact with the transaction via a browser
- Add a fund matching scheme where someone can say they will match future contributions
