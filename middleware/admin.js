const con = require("../lib/db_connection");

// Must run AFTER middleware/auth. Checks the role in the database on every
// request (not the role baked into the JWT), so demoting an admin takes effect
// immediately instead of when their 365-day token expires.
module.exports = function (req, res, next) {
  con.query(
    "SELECT user_type FROM users WHERE id = ?",
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ msg: "Database error" });
      }
      if (!rows.length || rows[0].user_type !== "Admin") {
        return res.status(403).json({ msg: "Admin access required" });
      }
      next();
    }
  );
};
