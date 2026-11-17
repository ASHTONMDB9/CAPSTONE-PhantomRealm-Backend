// In-store credits. All functions take a mysql connection so they can run inside
// the same transaction as the order they belong to.

// Welcome credits for a new account (same promise as the About section).
const START_BALANCE = 1000000;

const query = (conn, sql, params) =>
  new Promise((resolve, reject) =>
    conn.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

class InsufficientCredits extends Error {
  constructor(balance, needed) {
    super("Not enough credits");
    this.balance = balance;
    this.needed = needed;
  }
}

// Make sure the user has a wallet; the first time, it is created with the
// welcome credits and a 'bonus' entry in the ledger.
async function ensureWallet(conn, userId) {
  const r = await query(
    conn,
    "INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, ?)",
    [userId, START_BALANCE]
  );
  if (r.affectedRows === 1) {
    await query(
      conn,
      "INSERT INTO wallet_transactions (user_id, amount, balance_after, type) VALUES (?, ?, ?, 'bonus')",
      [userId, START_BALANCE, START_BALANCE]
    );
  }
}

// Lock the wallet row for the rest of the transaction and return the balance.
// Concurrent orders from the same user wait here, so they can never overspend.
async function lockBalance(conn, userId) {
  const rows = await query(
    conn,
    "SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE",
    [userId]
  );
  return rows.length ? Number(rows[0].balance) : null;
}

async function spend(conn, userId, amount, orderId) {
  await ensureWallet(conn, userId);
  const balance = await lockBalance(conn, userId);
  if (balance === null) throw new Error("No wallet for user " + userId);
  if (balance < amount) throw new InsufficientCredits(balance, amount);
  return change(conn, userId, -amount, "order", orderId);
}

async function refund(conn, userId, amount, orderId) {
  await ensureWallet(conn, userId);
  await lockBalance(conn, userId);
  return change(conn, userId, amount, "refund", orderId);
}

// Apply the change and write the ledger entry. Returns the new balance.
async function change(conn, userId, amount, type, orderId) {
  await query(conn, "UPDATE wallets SET balance = balance + ? WHERE user_id = ?", [amount, userId]);
  const rows = await query(conn, "SELECT balance FROM wallets WHERE user_id = ?", [userId]);
  const balanceAfter = Number(rows[0].balance);
  await query(
    conn,
    "INSERT INTO wallet_transactions (user_id, amount, balance_after, type, order_id) VALUES (?, ?, ?, ?, ?)",
    [userId, amount, balanceAfter, type, orderId]
  );
  return balanceAfter;
}

module.exports = { START_BALANCE, InsufficientCredits, ensureWallet, lockBalance, spend, refund, query };
