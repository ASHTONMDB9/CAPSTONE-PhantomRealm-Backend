const express = require("express");
const router = express.Router();
const con = require("../lib/db_connection");
const middleware = require("../middleware/auth");

//Get all orders
router.get("/", (req, res) => {
  try {
    con.query("SELECT * FROM orders", (err, result) => {
      if (err) throw err;
      res.send(result);
    });
  } catch (error) {
    console.log(error);
  }
});


// Gets one order
router.get("/:id", (req, res) => {
    try {
      con.query(`SELECT * FROM orders WHERE id = ${req.params.id}`, (err, result) => {
        if (err) throw err;
        res.send(result);
      });
      // res.send({ id: req.params.id });
    } catch (error) {
      console.log(error);
      res.status(400).send(error);
    }
  });

  //update orders
  router.put("/update_order/:id",middleware, (req, res) => {
    // if(req.user.user_type === "Admin") {
    // the below allows you to only need one const, but every input required is inside of the brackets
    const {
        first_name,
        last_name,
        country,
        street_address,
        city,
        province,
        postcode,
        phone_number,
        email
    } = req.body;
    // OR
    // the below requires you to add everything one by one
    //   const email = req.body.email;
    try {
      con.query(
        //When using the ${}, the content of con.query MUST be in the back tick
        `UPDATE orders set first_name="${first_name}", last_name="${last_name}", country="${country}", street_address="${street_address}", city="${city}", province="${province}", postcode="${postcode}", phone_number="${phone_number}", email="${email}" WHERE id = "${req.params.id}"`,
        (err, result) => {
          if (err) throw err;
          res.send("order successfully updated");
        }
      );
    } catch (error) {
      console.log(error);
      res.status(400).send(error);
    }}
    // else{
    //   res.send("Not an Admin, access denied!");
    // } 
  );


  // Add new orders
  router.post("/add_order", (req, res) => {
    // if(req.user.user_type === "Admin") {
    // the below allows you to only need one const, but every input required is inside of the brackets
    const {
        first_name,
        last_name,
        country,
        street_address,
        city,
        province,
        postcode,
        phone_number,
        email
    } = req.body;
    // OR
    // the below requires you to add everything one by one
    //   const email = req.body.email;
    try {
      con.query(
        //When using the ${}, the content of con.query MUST be in the back tick
        `INSERT INTO orders (
        first_name,
        last_name,
        country,
        street_address,
        city,
        province,
        postcode,
        phone_number,
        email) VALUES ( "${first_name}", "${last_name}", "${country}", "${street_address}", "${city}", "${province}", "${postcode}", "${phone_number}", "${email}")`,
        (err, result) => {
          if (err) throw err;
          res.send("order successfully created");
        }
      );
    } catch (error) {
      console.log(error);
      res.status(400).send(error);
    }}
    // else{
  //     res.send("Not an Admin, access denied!");
  //   } 
 );
  
  // Delete one orders
  router.delete("/delete_order/:id",middleware, (req, res) => {
    // if(req.user.user_type === "Admin") {
      try {
        con.query(`DELETE FROM orders WHERE id = ${req.params.id}`, (err, result) => {
          if (err) throw err;
          res.send("Sucessfully deleted this order");
        });
        // res.send({ id: req.params.id });
      } catch (error) {
        console.log(error);
        res.status(400).send(error);
      }}
      // else{
      //   res.send("Not an Admin, access denied!");
      //  } 
    );


module.exports = router;