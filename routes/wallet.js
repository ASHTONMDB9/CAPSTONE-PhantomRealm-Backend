const express = require("express");
const router = express.Router();
const con = require("../lib/db_connection");
const auth = require("../middleware/auth");
const { ensureWallet, query } = require("../lib/wallet");

// My wallet: current balance plus the latest activity.
router.get("/", auth, async (req, res) => {
  try {
    await ensureWallet(con, req.user.id);
    const wallet = await query(con, "SELECT balance FROM wallets WHERE user_id = ?", [req.user.id]);
    if (!wallet.length) return res.status(401).json({ msg: "Account no longer exists" });

    const transactions = await query(
      con,
      "SELECT id, amount, balance_after, type, order_id, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20",
      [req.user.id]
    );
    res.json({
      balance: Number(wallet[0].balance),
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
        balance_after: Number(t.balance_after),
      })),
    });
  } catch (error) {
    console.log(error.code || error.message);
    res.status(500).json({ msg: "Database error" });
  }
});

module.exports = router;
