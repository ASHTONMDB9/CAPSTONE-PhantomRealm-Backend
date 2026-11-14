const express = require("express");
const router = express.Router();
const con = require("../lib/db_connection");
const auth = require("../middleware/auth");

// The browser shrinks the picture to a small square JPEG before uploading, so
// this limit is generous. It also stays under express.json()'s 100kb body limit.
const MAX_LENGTH = 90000;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const fail = (res, err) => {
  console.log(err);
  res.status(500).json({ msg: "Database error" });
};

// Get my picture -> { image: "data:image/jpeg;base64,..." } or { image: null }
router.get("/", auth, (req, res) => {
  con.query(
    "SELECT image FROM user_profile_images WHERE user_id = ?",
    [req.user.id],
    (err, rows) => {
      if (err) return fail(res, err);
      res.json({ image: rows.length ? rows[0].image : null });
    }
  );
});

// Add or replace my picture. Body: { image: "data:image/...;base64,..." }
router.put("/", auth, (req, res) => {
  const image = req.body && req.body.image;
  if (typeof image !== "string" || image.length > MAX_LENGTH || !DATA_URL.test(image)) {
    return res.status(400).json({ msg: "Please choose a valid, smaller image (JPEG, PNG or WebP)" });
  }
  con.query(
    "INSERT INTO user_profile_images (user_id, image) VALUES (?, ?) ON DUPLICATE KEY UPDATE image = VALUES(image)",
    [req.user.id, image],
    (err) => {
      if (err) return fail(res, err);
      res.json({ msg: "Profile picture updated" });
    }
  );
});

// Remove my picture (the profile page goes back to the initial)
router.delete("/", auth, (req, res) => {
  con.query("DELETE FROM user_profile_images WHERE user_id = ?", [req.user.id], (err) => {
    if (err) return fail(res, err);
    res.json({ msg: "Profile picture removed" });
  });
});

module.exports = router;
