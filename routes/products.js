const express = require("express");
const router = express.Router();
const con = require("../lib/db_connection");
const middleware = require("../middleware/auth");

//Get all products
router.get("/", (req, res) => {
  try {
    con.query("SELECT * FROM products", (err, result) => {
      if (err) throw err;
      res.send(result);
    });
  } catch (error) {
    console.log(error);
  }
});


// Gets one product
router.get("/:id", (req, res) => {
    try {
      con.query(`SELECT * FROM products WHERE id = ${req.params.id}`, (err, result) => {
        if (err) throw err;
        res.send(result);
      });
      // res.send({ id: req.params.id });
    } catch (error) {
      console.log(error);
      res.status(400).send(error);
    }
  });

  //update products
  router.patch("/update_product/:id",middleware, (req, res) => {
    // if(req.user.user_type === "Admin") {
    // the below allows you to only need one const, but every input required is inside of the brackets
    const {
        title,
        description,
        category,
        image,
        price,
    } = req.body;
    // OR
    // the below requires you to add everything one by one
    //   const email = req.body.email;
    try {
      con.query(
        //When using the ${}, the content of con.query MUST be in the back tick
        `UPDATE products set title="${title}", description="${description}", category="${category}", image="${image}", price="${price}" WHERE id = "${req.params.id}"`,
        (err, result) => {
          if (err) throw err;
          res.json({msg:"Product updated successfully"});
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


  // Add new products
  router.post("/add_product", (req, res) => {
    // if(req.user.user_type === "Admin") {
    // the below allows you to only need one const, but every input required is inside of the brackets
    const {
        title,
        description,
        category,
        image,
        price,
    } = req.body;
    // OR
    // the below requires you to add everything one by one
    //   const email = req.body.email;
    try {
      con.query(
        //When using the ${}, the content of con.query MUST be in the back tick
        `INSERT INTO products (
        title,
        description,
        category,
        image,
        price) VALUES ( "${title}", "${description}", "${category}", "${image}", "${price}" )`,
        (err, result) => {
          if (err) throw err;
          res.json({msg:"New product created"});
        }
      );
    } catch (error) {
      console.log(error);
      res.status(400).send(error);
    }}
    // else{
    //   res.send("Not an Admin, access denied!");
    // } }
 );
  
  // Delete one products
  router.delete("/delete_product/:id",middleware, (req, res) => {
    // if(req.user.user_type === "Admin") {
      try {
        con.query(`DELETE FROM products WHERE id = ${req.params.id}`, (err, result) => {
          if (err) throw err;
          res.json({msg:"Deleted this product"});
        });
        // res.send({ id: req.params.id });
      } catch (error) {
        console.log(error);
        res.status(400).send(error);
      }}
      // else{
      //   res.send("Not an Admin, access denied!");
      //  }
      // }
    );


module.exports = router;
