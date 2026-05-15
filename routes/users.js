const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const con = require("../lib/db_connection");
const jwt = require("jsonwebtoken");
const middleware = require("../middleware/auth");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// EMAIL TRANSPORTER (add env variables)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

//FORGOT PASSWORD
router.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";

  con.query(sql, [email], (err, results) => {
    if (err) throw err;

    if (results.length === 0) {
      return res.json({ msg: "Email not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const updateSql =
      "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?";

    con.query(updateSql, [token, expiry, email], (err) => {
      if (err) throw err;

      const resetLink = `https://capstone-phantomrealm-backend.onrender.com/users/reset-password/${token}`;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Password Reset Request",
        html: `
          <h2>Password Reset</h2>
          <p>Click below to reset your password:</p>
          <a href="${resetLink}">${resetLink}</a>
          <p>This link expires in 1 hour.</p>
        `,
      };

      transporter.sendMail(mailOptions, (error) => {
        if (error) {
          return res.status(500).json({ msg: "Email failed to send" });
        }

        res.json({ msg: "Reset link sent successfully" });
      });
    });
  });
});

router.post("/reset-password", (req, res) => {
  const { token, newPassword } = req.body;

  const sql =
    "SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()";

  con.query(sql, [token], (err, results) => {
    if (err) throw err;

    if (results.length === 0) {
      return res.json({ msg: "Invalid or expired token" });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);

    const updateSql =
      "UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE reset_token = ?";

    con.query(updateSql, [hash, token], (err) => {
      if (err) throw err;

      res.json({ msg: "Password reset successfully" });
    });
  });
});

router.post("/register", (req, res) => {
  try {
    let sql = "INSERT INTO users SET ?";
    const { full_name, email, password, phone_number, user_type } = req.body;

    // The start of hashing / encryption
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    let user = {
      full_name,
      email,
      // We sending the hash value to be stored witin the table
      password: hash,
      phone_number,
      user_type,
    };
    con.query(sql, user, (err, result) => {
      if (err) throw err;
      console.log(result);
      res.json({
        msg: `Welcome ${user.full_name},``Account ${user.email} created`,
      });
    });
  } catch (error) {
    console.log(error);
  }
});

// Login
// The Route where Decryption happens
router.post("/login", (req, res) => {
  try {
    let sql = "SELECT * FROM users WHERE ?";
    let user = {
      email: req.body.email,
    };
    con.query(sql, user, async (err, result) => {
      if (err) throw err;
      if (result.length === 0) {
        res.json({ msg: "Email not found please register" });
      } else {
        const isMatch = await bcrypt.compare(
          req.body.password,
          result[0].password
        );
        if (!isMatch) {
          res.json({ msg: "Password incorrect" });
        } else {
          // The information the should be stored inside token
          const payload = {
            user: {
              id: result[0].id,
              full_name: result[0].full_name,
              email: result[0].email,
              user_type: result[0].user_type,
            },
          };
          // Creating a token and setting expiry date
          jwt.sign(
            payload,
            process.env.jwtSecret,
            {
              expiresIn: "365d",
            },
            (err, token) => {
              if (err) throw err;
              res.json({ token });
              console.log(req.body);
            }
          );
        }
      }
    });
  } catch (error) {
    console.log(error);
  }
});

// Verify
router.get("/users/verify", (req, res) => {
  const token = req.header("x-auth-token");
  jwt.verify(token, process.env.jwtSecret, (error, decodedToken) => {
    if (error) {
      res.status(401).json({
        msg: "Unauthorized Access!",
      });
    } else {
      res.status(200);
      res.send(decodedToken);
    }
  });
});

router.get("/", (req, res) => {
  try {
    let sql = "SELECT * FROM users";
    con.query(sql, (err, result) => {
      if (err) throw err;
      res.send(result);
    });
  } catch (error) {
    console.log(error);
  }
});

// Gets all users
router.get("/", (req, res) => {
  try {
    con.query("SELECT * FROM users", (err, result) => {
      if (err) throw err;
      res.json(result);
    });
  } catch (error) {
    console.log(error);
    res.status(400).json(error);
  }
});

// Gets one user
router.get("/:id", (req, res) => {
  try {
    con.query(
      `SELECT * FROM users WHERE id = ${req.params.id}`,
      (err, result) => {
        if (err) throw err;
        res.send(result);
      }
    );
    // res.send({ id: req.params.id });
  } catch (error) {
    console.log(error);
    res.status(400).send(error);
  }
});

// Delete user
router.delete("/delete_user/:id", middleware, (req, res) => {
  try {
    con.query(
      `DELETE FROM users WHERE id="${req.params.id}"`,
      (err, result) => {
        if (err) throw err;
        res.json({ msg: "User deleted successfully" });
      }
    );
  } catch (error) {
    console.log(error);
    res.status(400).send(error);
  }
});

//Update users
router.put("/update_user/:id", middleware, (req, res) => {
  const { email, password, full_name, phone_number, user_type } = req.body;

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  try {
    con.query(
      `UPDATE users 
       SET email="${email}",
           password="${hash}",
           full_name="${full_name}",
           phone_number="${phone_number}",
           user_type="${user_type}" 
       WHERE id="${req.params.id}"`,
      (err, result) => {
        if (err) throw err;
        res.json({ msg: "User updated successfully" });
      }
    );
  } catch (error) {
    console.log(error);
    res.status(400).send(error);
  }
});

module.exports = router;
