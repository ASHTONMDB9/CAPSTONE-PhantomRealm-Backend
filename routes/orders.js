const express = require("express");
const router = express.Router();
const con = require("../lib/db_connection");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const wallet = require("../lib/wallet");

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

// ---------- small promise helpers around the mysql pool ----------
const query = (conn, sql, params) =>
  new Promise((resolve, reject) =>
    conn.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );
const getConnection = () =>
  new Promise((resolve, reject) =>
    con.getConnection((err, conn) => (err ? reject(err) : resolve(conn)))
  );
const begin = (conn) =>
  new Promise((resolve, reject) =>
    conn.beginTransaction((err) => (err ? reject(err) : resolve()))
  );
const commit = (conn) =>
  new Promise((resolve, reject) =>
    conn.commit((err) => (err ? reject(err) : resolve()))
  );
const rollback = (conn) =>
  new Promise((resolve) => conn.rollback(() => resolve()));

const fail = (res, error) => {
  console.log(error);
  res.status(500).json({ msg: "Database error" });
};

// Attach an `items` array to each order (one extra query, not one per order).
async function withItems(orders) {
  if (!orders.length) return orders;
  const items = await query(
    con,
    "SELECT id, order_id, product_id, title, image, price, quantity FROM order_items WHERE order_id IN (?) ORDER BY id",
    [orders.map((o) => o.id)]
  );
  const byOrder = {};
  items.forEach((i) => (byOrder[i.order_id] = byOrder[i.order_id] || []).push(i));
  return orders.map((o) => ({ ...o, items: byOrder[o.id] || [] }));
}

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------- CREATE an order (logged-in users) ----------
// Body: { items: [{ product_id, quantity }], shipping: { country, street_address,
//         city, province, postcode, phone_number? }, notes? }
// Name / email / phone come from the logged-in user's account, and prices come
// from the products table, so nothing sensitive is trusted from the client.
router.post("/", auth, async (req, res) => {
  const { items, shipping = {}, notes } = req.body || {};

  // --- validate input ---
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return res.status(400).json({ msg: "Your cart is empty" });
  }
  const wanted = new Map(); // product_id -> quantity (duplicates merged)
  for (const it of items) {
    const pid = Number(it && it.product_id);
    const qty = Number(it && it.quantity);
    if (!Number.isInteger(pid) || pid < 1 || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ msg: "Invalid item in cart" });
    }
    wanted.set(pid, Math.min((wanted.get(pid) || 0) + qty, 99));
  }

  const address = {
    country: clean(shipping.country, 100),
    street_address: clean(shipping.street_address, 255),
    city: clean(shipping.city, 100),
    province: clean(shipping.province, 100),
    postcode: clean(shipping.postcode, 20),
  };
  const missing = Object.keys(address).filter((k) => !address[k]);
  if (missing.length) {
    return res.status(400).json({ msg: "Missing delivery details: " + missing.join(", ") });
  }

  let conn;
  try {
    // --- load the customer and the real product prices from the DB ---
    const users = await query(
      con,
      "SELECT id, full_name, email, phone_number FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!users.length) return res.status(401).json({ msg: "Account no longer exists" });
    const customer = users[0];

    const phone = clean(shipping.phone_number, 30) || customer.phone_number;
    if (!phone) {
      return res.status(400).json({ msg: "A contact phone number is required" });
    }

    const products = await query(
      con,
      "SELECT id, title, image, price FROM products WHERE id IN (?)",
      [[...wanted.keys()]]
    );
    const found = new Map(products.map((p) => [p.id, p]));
    const gone = [...wanted.keys()].filter((id) => !found.has(id));
    if (gone.length) {
      return res.status(400).json({
        msg: "Some products in your cart are no longer available",
        unavailable: gone,
      });
    }

    const lines = [...wanted.entries()].map(([pid, qty]) => {
      const p = found.get(pid);
      return { product_id: pid, title: p.title, image: p.image, price: Number(p.price), quantity: qty };
    });
    // work in whole cents so the total never drifts (0.1 + 0.2 style errors)
    const total =
      lines.reduce((sum, l) => sum + Math.round(l.price * 100) * l.quantity, 0) / 100;

    const [first_name, ...rest] = String(customer.full_name || "").trim().split(/\s+/);

    // --- write order + items atomically ---
    conn = await getConnection();
    await begin(conn);
    const result = await query(
      conn,
      "INSERT INTO orders SET ?",
      {
        user_id: customer.id,
        first_name: first_name || "",
        last_name: rest.join(" "),
        email: customer.email,
        phone_number: phone,
        ...address,
        total: total.toFixed(2),
        notes: clean(notes, 1000) || null,
      }
    );
    await query(
      conn,
      "INSERT INTO order_items (order_id, product_id, title, image, price, quantity) VALUES ?",
      [lines.map((l) => [result.insertId, l.product_id, l.title, l.image, l.price, l.quantity])]
    );
    // Pay with in-store credits. If there aren't enough this throws, and the
    // rollback below removes the order again, so nothing is half-saved.
    const newBalance = await wallet.spend(conn, customer.id, total, result.insertId);
    await commit(conn);

    res.status(201).json({
      msg: "Order placed successfully",
      order: { id: result.insertId, total: Number(total.toFixed(2)), status: "pending" },
      wallet: { balance: newBalance },
    });
  } catch (error) {
    if (conn) await rollback(conn);
    if (error instanceof wallet.InsufficientCredits) {
      return res.status(400).json({
        msg: `Not enough credits. This order costs ${error.needed.toLocaleString("en-US")} and your wallet has ${error.balance.toLocaleString("en-US")}.`,
        balance: error.balance,
        needed: error.needed,
      });
    }
    fail(res, error);
  } finally {
    if (conn) conn.release();
  }
});

// ---------- the logged-in user's own orders ----------
router.get("/mine", auth, async (req, res) => {
  try {
    const orders = await query(
      con,
      "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC",
      [req.user.id]
    );
    res.json(await withItems(orders));
  } catch (error) {
    fail(res, error);
  }
});

// ---------- ADMIN: all orders ----------
router.get("/", auth, admin, async (req, res) => {
  try {
    const orders = await query(con, "SELECT * FROM orders ORDER BY created_at DESC, id DESC");
    res.json(await withItems(orders));
  } catch (error) {
    fail(res, error);
  }
});

// ---------- one order (its owner, or an admin) ----------
router.get("/:id", auth, async (req, res) => {
  try {
    const rows = await query(con, "SELECT * FROM orders WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ msg: "Order not found" });

    if (rows[0].user_id !== req.user.id) {
      const me = await query(con, "SELECT user_type FROM users WHERE id = ?", [req.user.id]);
      if (!me.length || me[0].user_type !== "Admin") {
        return res.status(404).json({ msg: "Order not found" }); // don't reveal it exists
      }
    }
    res.json((await withItems(rows))[0]);
  } catch (error) {
    fail(res, error);
  }
});

// Run `work(conn, order)` in a transaction with the order row locked, so two
// requests can never refund the same order twice. Returns a http-style result.
async function withLockedOrder(orderId, work) {
  const conn = await getConnection();
  try {
    await begin(conn);
    const rows = await query(conn, "SELECT id, user_id, status, total FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (!rows.length) {
      await rollback(conn);
      return { code: 404, body: { msg: "Order not found" } };
    }
    const result = await work(conn, rows[0]);
    if (result.code >= 400) await rollback(conn);
    else await commit(conn);
    return result;
  } catch (error) {
    await rollback(conn);
    throw error;
  } finally {
    conn.release();
  }
}

// Give the credits for an order back (only orders that were paid by a user).
async function refundOrder(conn, order) {
  if (order.user_id && Number(order.total) > 0) {
    return wallet.refund(conn, order.user_id, Number(order.total), order.id);
  }
  return null;
}

// ---------- ADMIN: change status ----------
// Cancelling refunds the credits. A cancelled order can't be reopened (that
// would need the credits taken again).
router.put("/:id/status", auth, admin, async (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ msg: "Invalid status", allowed: STATUSES });
  }
  try {
    const out = await withLockedOrder(req.params.id, async (conn, order) => {
      if (order.status === status) return { code: 200, body: { msg: "Order status updated", status } };
      if (order.status === "cancelled") {
        return { code: 400, body: { msg: "A cancelled order can't be reopened" } };
      }
      await query(conn, "UPDATE orders SET status = ? WHERE id = ?", [status, order.id]);
      if (status === "cancelled") await refundOrder(conn, order);
      return { code: 200, body: { msg: "Order status updated", status } };
    });
    res.status(out.code).json(out.body);
  } catch (error) {
    fail(res, error);
  }
});

// ---------- customer: cancel own order while it is still pending (credits refunded) ----------
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const out = await withLockedOrder(req.params.id, async (conn, order) => {
      if (order.user_id !== req.user.id || order.status !== "pending") {
        return { code: 400, body: { msg: "Only your own pending orders can be cancelled" } };
      }
      await query(conn, "UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
      const balance = await refundOrder(conn, order);
      return { code: 200, body: { msg: "Order cancelled", status: "cancelled", wallet: { balance } } };
    });
    res.status(out.code).json(out.body);
  } catch (error) {
    fail(res, error);
  }
});

// ---------- ADMIN: delete (credits are refunded unless it was delivered or already cancelled) ----------
router.delete("/:id", auth, admin, async (req, res) => {
  try {
    const out = await withLockedOrder(req.params.id, async (conn, order) => {
      if (order.status !== "delivered" && order.status !== "cancelled") {
        await refundOrder(conn, order);
      }
      await query(conn, "DELETE FROM orders WHERE id = ?", [order.id]);
      return { code: 200, body: { msg: "Order deleted" } };
    });
    res.status(out.code).json(out.body);
  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
