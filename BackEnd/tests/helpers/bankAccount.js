const pii = require("../../src/utils/pii");

// A teacher bank account already approved by Admin and past its change lock (BAO-09): payouts can use it
const verifiedBankAccount = (accountHolderName, accountNumber = "0123456789", bankName = "Vietcombank") => ({
  bankName,
  accountNumberEnc: pii.encrypt(accountNumber),
  accountNumberLast4: accountNumber.slice(-4),
  accountHolderName,
  status: "VERIFIED",
  submittedAt: new Date("2020-01-01T00:00:00Z"),
  payoutLockedUntil: new Date("2020-01-04T00:00:00Z"),
});

module.exports = { verifiedBankAccount };
