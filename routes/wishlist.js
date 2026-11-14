const express = require("express");
const router = express.Router();
const con = require("../lib/db_connection");
const auth = require("../middleware/auth");

const fail = (res, err) => {
  console.log(err);
  res.status(500).json({ msg: "Database error" });
};

const validId = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

// My wishlist: the full product for each item, most recently added first
router.get("/", auth, (req, res) => {
  con.query(
    `SELECT p.id, p.title, p.category, p.image, p.price, p.description, w.created_at AS added_at
       FROM wishlist_items w
       JOIN products p ON p.id = w.product_id
      WHERE w.user_id = ?
      ORDER BY w.created_at DESC, p.id DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return fail(res, err);
      res.json(rows);
    }
  );
});

// Add a product (adding something already there is fine)
router.post("/:productId", auth, (req, res) => {
  if (!validId(req.params.productId)) {
    return res.status(400).json({ msg: "Invalid product" });
  }
  con.query(
    // ON DUPLICATE KEY makes re-adding harmless without hiding real errors
    // (INSERT IGNORE would also swallow the missing-product error).
    "INSERT INTO wishlist_items (user_id, product_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id",
    [req.user.id, req.params.productId],
    (err) => {
      if (err) {
        if (err.code === "ER_NO_REFERENCED_ROW_2") {
          return res.status(404).json({ msg: "Product not found" });
        }
        return fail(res, err);
      }
      res.json({ msg: "Added to wishlist" });
    }
  );
});

// Remove a product (removing something not there is fine)
router.delete("/:productId", auth, (req, res) => {
  if (!validId(req.params.productId)) {
    return res.status(400).json({ msg: "Invalid product" });
  }
  con.query(
    "DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?",
    [req.user.id, req.params.productId],
    (err) => {
      if (err) return fail(res, err);
      res.json({ msg: "Removed from wishlist" });
    }
  );
});

module.exports = router;
