const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const con = require("../lib/db_connection");
const jwt = require("jsonwebtoken");
const middleware = require("../middleware/auth");
const nodemailer = require("nodemailer");

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

// EMAIL TRANSPORTER
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
transporter.verify((error, success) => {
  if (error) {
    console.log("SMTP ERROR:", error);
  } else {
    console.log("SMTP SERVER READY");
  }
});

// FORGOT PASSWORD
router.post("/forgot-password", (req, res) => {
  console.log("FORGOT PASSWORD ROUTE HIT");
  console.log(req.body);

  const { email } = req.body;

  con.query("SELECT * FROM users WHERE email = ?", [email], (err, result) => {
    if (err) {
      console.log("DATABASE ERROR:", err);

      return res.status(500).json({
        msg: "Database error",
      });
    }

    if (result.length === 0) {
      return res.json({
        msg: "Email not found",
      });
    }

    // CREATE TOKEN
    const payload = {
      user: {
        id: result[0].id,
        email: result[0].email,
      },
    };

    const token = jwt.sign(payload, process.env.jwtSecret, {
      expiresIn: "15m",
    });

    // RESET LINK
    const resetLink = `https://phantomrealm.netlify.app/reset-password?token=${token}`;

    // EMAIL CONTENT
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Reset Your Password",
      html: `
          <h2>PhantomRealm Password Reset</h2>

          <p>You requested to reset your password.</p>

          <p>Click the link below:</p>

          <a href="${resetLink}">
            Reset Password
          </a>

          <p>This link expires in 15 minutes.</p>
        `,
    };

    // SEND EMAIL
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("EMAIL ERROR:", error);

        return res.status(500).json({
          msg: "Failed to send email",
          error: error.message,
        });
      }

      console.log("EMAIL SENT:", info.response);

      res.json({
        msg: "Reset link sent successfully",
      });
    });
  });
});

// RESET PASSWORD
router.post("/reset-password", (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      msg: "Token and password are required",
    });
  }

  jwt.verify(token, process.env.jwtSecret, (err, decoded) => {
    if (err) {
      console.log("JWT ERROR:", err);

      return res.status(401).json({
        msg: "Invalid or expired token",
      });
    }

    // HASH PASSWORD
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);

    // UPDATE PASSWORD
    con.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hash, decoded.user.id],
      (err, result) => {
        if (err) {
          console.log("DATABASE ERROR:", err);

          return res.status(500).json({
            msg: "Database error",
          });
        }

        res.json({
          msg: "Password reset successfully",
        });
      }
    );
  });
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
